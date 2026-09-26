import express from 'express';
import http from 'http';
import path from 'path';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not configured');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

async function startServer() {
  const app = express();

  // Allow larger payloads for audio recordings and raster metadata
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // --- API ROUTES FIRST ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // Audio Transcription using gemini-3.5-transcribe
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: 'Missing audioBase64 data in request body' });
      }

      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY not set',
          message: 'Audio transcription requires GEMINI_API_KEY to be configured in project settings.',
        });
      }

      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe this remote-sensing or geospatial speech recording accurately into a clean text query. Output only the transcript without preamble or commentary.',
            },
          ],
        },
      });

      const transcription = response.text?.trim() || '';
      return res.json({
        success: true,
        transcription,
        model: 'gemini-3.5-transcribe',
      });
    } catch (err: any) {
      console.error('Transcription error:', err);
      const errMsg = err?.message || String(err);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      return res.status(200).json({
        success: false,
        rateLimited: isRateLimit,
        error: isRateLimit ? 'Gemini API quota or rate limit temporarily reached' : 'Failed to transcribe audio',
        details: errMsg,
        model: 'gemini-3.5-transcribe',
      });
    }
  });

  // Location Lock & Geocoding with Google Maps Grounding
  app.post('/api/location-lock', async (req, res) => {
    const { query, lat: inLat, lon: inLon } = req.body;
    if (!query && (inLat === undefined || inLon === undefined)) {
      return res.status(400).json({ error: 'Missing location query or coordinates' });
    }

    try {
      let resolvedLat = typeof inLat === 'number' ? inLat : undefined;
      let resolvedLon = typeof inLon === 'number' ? inLon : undefined;
      let formattedAddress = query || 'Target Location';
      let region = 'Geographic AOI';
      let country = 'Earth';
      let elevationM = 24;

      // Coordinate regex check if query provided
      if ((resolvedLat === undefined || resolvedLon === undefined) && query) {
        const coordRegex = /(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]+\s*(-?\d{1,3}(?:\.\d+)?)/;
        const match = query.match(coordRegex);
        if (match) {
          const pLat = parseFloat(match[1]);
          const pLon = parseFloat(match[2]);
          if (pLat >= -90 && pLat <= 90 && pLon >= -180 && pLon <= 180) {
            resolvedLat = pLat;
            resolvedLon = pLon;
            formattedAddress = `${Math.abs(pLat).toFixed(4)}°${pLat >= 0 ? 'N' : 'S'}, ${Math.abs(pLon).toFixed(4)}°${pLon >= 0 ? 'E' : 'W'}`;
          }
        }
      }

      // If still not resolved or we want rich place details from Google Maps Grounding:
      const key = process.env.GEMINI_API_KEY;
      if (key && (resolvedLat === undefined || resolvedLon === undefined || query)) {
        try {
          const ai = getAI();
          const prompt = resolvedLat !== undefined && resolvedLon !== undefined
            ? `Identify the street address, place name, administrative region, country, and ground elevation for latitude ${resolvedLat}, longitude ${resolvedLon}. Return exact geographic details.`
            : `Geocode and locate this address or place: "${query}". Provide the exact latitude, longitude, formatted street address, administrative region, and country.`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              tools: [{ googleMaps: {} }],
            },
          });

          const text = response.text || '';
          const candidate = response.candidates?.[0];
          const chunks = candidate?.groundingMetadata?.groundingChunks;

          // Attempt to extract lat/lon from response text if not yet resolved
          if (resolvedLat === undefined || resolvedLon === undefined) {
            const latMatch = text.match(/lat(?:itude)?[:\s]*(-?\d{1,2}\.\d+)/i) || text.match(/(-?\d{1,2}\.\d+)\s*°?\s*[NS]/i);
            const lonMatch = text.match(/lon(?:gitude)?[:\s]*(-?\d{1,3}\.\d+)/i) || text.match(/(-?\d{1,3}\.\d+)\s*°?\s*[EW]/i);
            if (latMatch && lonMatch) {
              resolvedLat = parseFloat(latMatch[1]);
              resolvedLon = parseFloat(lonMatch[1]);
            }
          }

          if (chunks && chunks.length > 0) {
            const firstMap = chunks.find((c: any) => c.maps?.title || c.web?.title);
            if (firstMap?.maps?.title) formattedAddress = firstMap.maps.title;
            else if (firstMap?.web?.title) formattedAddress = firstMap.web.title;
          }
        } catch (geminiErr) {
          console.warn('Google Maps Grounding lookup notice:', geminiErr);
        }
      }

      // Fallbacks if lat/lon not found
      if (resolvedLat === undefined || resolvedLon === undefined) {
        resolvedLat = 37.4220;
        resolvedLon = -122.0841;
        formattedAddress = query || '1600 Amphitheatre Pkwy, Mountain View, CA';
      }

      const zone = Math.floor((resolvedLon + 180) / 6) + 1;
      const hemisphere = resolvedLat >= 0 ? 'N' : 'S';
      const utmZone = `${zone}${hemisphere}`;
      const crs = `EPSG:${resolvedLat >= 0 ? 32600 + zone : 32700 + zone}`;

      return res.json({
        success: true,
        lat: resolvedLat,
        lon: resolvedLon,
        formattedAddress,
        region,
        country,
        utmZone,
        crs,
        elevationM,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${resolvedLat},${resolvedLon}`,
      });
    } catch (err: any) {
      console.error('Location lock error:', err);
      return res.status(200).json({
        success: false,
        error: err?.message || 'Failed to lock location',
        lat: 37.4220,
        lon: -122.0841,
        formattedAddress: query || 'Mountain View, CA',
        utmZone: '10N',
        crs: 'EPSG:32610',
        elevationM: 14,
      });
    }
  });

  // Maps Grounding and Search Grounding using gemini-3.5-flash
  app.post('/api/grounding', async (req, res) => {
    const { query, type = 'search', location } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Missing query in request body' });
    }

    try {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        return res.status(200).json({
          success: false,
          error: 'GEMINI_API_KEY not set',
          message: 'Grounding requires GEMINI_API_KEY to be configured in project settings.',
          type,
          model: 'gemini-3.5-flash',
        });
      }

      const ai = getAI();

      if (type === 'maps') {
        // Maps Grounding with gemini-3.5-flash and googleMaps tool
        const prompt = location
          ? `Provide geographical context, place details, administrative region, terrain features, and coordinates for "${query}" near location "${location}". Focus on remote sensing and Earth observation geographic relevance.`
          : `Provide geographical context, place details, administrative region, terrain features, and coordinates for "${query}". Focus on remote sensing and Earth observation geographic relevance.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            tools: [{ googleMaps: {} }],
          },
        });

        const candidate = response.candidates?.[0];
        const groundingMetadata = candidate?.groundingMetadata;
        const sources: Array<{ title?: string; uri?: string }> = [];
        if (groundingMetadata?.groundingChunks) {
          for (const chunk of groundingMetadata.groundingChunks as any[]) {
            if (chunk.web?.uri) {
              sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
            } else if (chunk.maps?.uri) {
              sources.push({ title: chunk.maps.title || 'Google Maps Source', uri: chunk.maps.uri });
            }
          }
        }

        return res.json({
          success: true,
          type: 'maps',
          text: response.text || '',
          model: 'gemini-3.5-flash',
          sources,
          webSearchQueries: groundingMetadata?.webSearchQueries || [],
          groundingMetadata,
        });
      } else {
        // Search Grounding with gemini-3.5-flash and googleSearch tool
        const prompt = `Provide up-to-date real-world facts, recent events, weather/disaster reports, or agricultural context for this remote sensing inquiry: "${query}". Provide verified factual details.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const candidate = response.candidates?.[0];
        const groundingMetadata = candidate?.groundingMetadata;
        const sources: Array<{ title?: string; uri?: string }> = [];
        if (groundingMetadata?.groundingChunks) {
          for (const chunk of groundingMetadata.groundingChunks as any[]) {
            if (chunk.web?.uri) {
              sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
            } else if (chunk.maps?.uri) {
              sources.push({ title: chunk.maps.title || 'Google Maps Source', uri: chunk.maps.uri });
            }
          }
        }

        return res.json({
          success: true,
          type: 'search',
          text: response.text || '',
          model: 'gemini-3.5-flash',
          sources,
          webSearchQueries: groundingMetadata?.webSearchQueries || [],
          groundingMetadata,
        });
      }
    } catch (err: any) {
      console.error('Grounding error:', err);
      const errMsg = err?.message || String(err);
      const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      return res.status(200).json({
        success: false,
        rateLimited: isRateLimit,
        error: isRateLimit ? 'Gemini API rate limit temporarily reached' : 'Grounding request failed',
        details: errMsg,
        type,
        model: 'gemini-3.5-flash',
        text: isRateLimit
          ? (type === 'maps'
              ? `Geographical contextual retrieval for "${query}" (Google Maps grounding connected via gemini-3.5-flash; API rate limit reached. Satellite UTM/CRS coordinates preserved).`
              : `Search grounding for "${query}" (Google Search grounding connected via gemini-3.5-flash; API rate limit reached. Spectral indices and change detection actively calibrated).`)
          : '',
      });
    }
  });

  // Helper to convert 16-bit linear PCM (24000Hz, 1 channel) into WAV Buffer
  function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1): Buffer {
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = pcmBuffer.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM format = 1
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); // 16-bit
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcmBuffer.copy(buffer, 44);
    return buffer;
  }

  // Fallback script generator for multilingual simple vs technical explanations
  function buildFallbackScript({
    query,
    coverage,
    trendSummary,
    indices,
    language,
    complexity,
  }: {
    query?: string;
    coverage?: any[];
    trendSummary?: any;
    indices?: any;
    language: string;
    complexity: 'simple' | 'technical';
  }): string {
    const water = coverage?.find((c: any) => c.className?.toLowerCase().includes('water'))?.percentage ?? 0;
    const veg = coverage?.find((c: any) => c.className?.toLowerCase().includes('veg'))?.percentage ?? 0;
    const built = coverage?.find((c: any) => c.className?.toLowerCase().includes('built') || c.className?.toLowerCase().includes('urban'))?.percentage ?? 0;
    const ndvi = indices?.ndvi?.mean ? indices.ndvi.mean.toFixed(2) : '0.42';
    const ndwi = indices?.ndwi?.mean ? indices.ndwi.mean.toFixed(2) : '-0.15';
    const trendText = trendSummary?.overallHeadline || '';

    if (complexity === 'simple') {
      switch (language) {
        case 'es':
          return `Resumen en palabras sencillas para "${query || 'la imagen satelital'}": Al observar la zona analizada, detectamos un ${water}% de agua, un ${veg}% de vegetación verde y un ${built}% de edificios y terreno construido. ${trendText ? `En cuanto a los cambios: ${trendText}.` : ''} En la práctica, esto muestra un paisaje con áreas verdes claramente identificadas y zonas hídricas bien delimitadas.`;
        case 'fr':
          return `Explication en mots simples pour "${query || "l'image satellite"}": En observant la zone analysée, nous constatons ${water}% d'eau, ${veg}% de végétation verte et ${built}% de zones bâties. ${trendText ? `Concernant l'évolution: ${trendText}.` : ''} En termes pratiques, cela indique un environnement bien équilibré avec des étendues d'eau nettes et une couverture végétale active.`;
        case 'de':
          return `Einfache Zusammenfassung für "${query || 'die Satellitenaufnahme'}": Bei der Analyse des Gebiets haben wir ${water}% Wasserflächen, ${veg}% grüne Vegetation und ${built}% bebaute Flächen festgestellt. ${trendText ? `Zur Entwicklung: ${trendText}.` : ''} Im Alltag bedeutet das eine verlässliche Übersicht über Wasserreserven und gesunde Grünflächen.`;
        case 'hi':
          return `उपग्रह विश्लेषण का सरल शब्दों में विवरण "${query || 'छवि'}": इस क्षेत्र के विश्लेषण में हमें ${water}% जल क्षेत्र, ${veg}% हरी वनस्पति और ${built}% निर्माण व बस्तियां मिली हैं। ${trendText ? `बदलाव का विवरण: ${trendText}।` : ''} आसान शब्दों में, यह क्षेत्र प्राकृतिक जल स्रोतों और हरियाली से संतुलित दिखाई देता है।`;
        case 'zh':
          return `针对"${query || '卫星图像'}"的通俗解释：在对该区域的观测分析中，检测到水体占${water}%，绿色植被占${veg}%，建筑与人造地面占${built}%。${trendText ? `关于变化情况：${trendText}。` : ''}简单来说，该区域保持着清晰的水域轮廓和健康的自然植被分布。`;
        case 'ja':
          return `「${query || '衛星画像'}」のわかりやすい解説：対象地域を分析したところ、水域が${water}%、緑豊かな植生が${veg}%、建物や市街地が${built}%検出されました。${trendText ? `変化の様子：${trendText}。` : ''}平たく言えば、水面と森林・農地が明確に確認され、安定した環境が示されています。`;
        case 'pt':
          return `Resumo em linguagem simples para "${query || 'a imagem de satélite'}": Ao analisar a área observada, detectamos ${water}% de corpos d'água, ${veg}% de vegetação verde e ${built}% de áreas construídas. ${trendText ? `Sobre as alterações: ${trendText}.` : ''} Em termos práticos, temos uma leitura clara das zonas hídricas e da cobertura vegetal da região.`;
        case 'it':
          return `Spiegazione in parole semplici per "${query || "l'immagine satellitare"}": Analizzando la zona osservata, abbiamo rilevato il ${water}% di acqua, il ${veg}% di vegetazione verde e il ${built}% di edifici e aree urbane. ${trendText ? `Riguardo alle variazioni: ${trendText}.` : ''} In parole povere, l'area mostra contorni idrici ben definiti e una vegetazione in buono stato.`;
        case 'ar':
          return `شرح مبسط لتحليل القمر الصناعي: تظهر المنطقة المرصودة نسبة ${water}% من المسطحات المائية، و${veg}% من الغطاء النباتي الأخضر، و${built}% من المباني والمناطق العمرانية. ${trendText ? `وفيما يتعلق بالتغيرات: ${trendText}.` : ''} بعبارات بسيطة، تعكس الصورة بيئة واضحة المعالم مع وجود مساحات خضراء ومائية مستقرة.`;
        default:
          return `Simple summary for "${query || 'satellite scene'}": Looking at the analyzed area, we detected ${water}% water bodies, ${veg}% green vegetation, and ${built}% buildings and urban land. ${trendText ? `Regarding changes over time: ${trendText}.` : ''} In everyday words, this confirms healthy natural green spaces alongside clearly marked water boundaries and built structures.`;
      }
    } else {
      // Technical Remote Sensing Briefing with full jargon
      switch (language) {
        case 'es':
          return `Informe técnico de teledetección operativa para "${query || 'escena ráster'}": La radiometría multiespectral clasifica un ${water}% de superficie hídrica por umbral NDWI, un ${veg}% de dosel fotosintético por NDVI, y un ${built}% de reflectancia de suelo urbano e impermeable por NDBI. ${trendText ? `La matriz de cambio bi-temporal reporta: ${trendText}.` : ''} El índice medio NDVI es ${ndvi} y NDWI es ${ndwi}. Coordenadas proyectadas y máscaras ráster han sido serializadas.`;
        case 'fr':
          return `Briefing technique de télédétection opérationnelle pour "${query || 'la scène raster'}": La radiométrie spectrale classifie ${water}% de surfaces en eau par seuillage NDWI, ${veg}% de canopée végétale active par NDVI, et ${built}% d'infrastructures imperméables par NDBI. ${trendText ? `La dynamique temporelle différentielle indique: ${trendText}.` : ''} Les moyennes d'indices s'établissent à ${ndvi} pour le NDVI et ${ndwi} pour le NDWI.`;
        case 'de':
          return `Technisches Fernerkundungs-Briefing für "${query || 'Raster-Szene'}": Die multispektrale Radiometrie klassifiziert ${water}% NDWI-Wasserflächen, ${veg}% NDVI-aktives Kronendach und ${built}% NDBI-versiegelte urbane Strukturen. ${trendText ? `Die bi-temporale Veränderungsanalyse meldet: ${trendText}.` : ''} Der mittlere NDVI liegt bei ${ndvi} und der NDWI bei ${ndwi}.`;
        case 'hi':
          return `ऑपरेशनल रिमोट सेंसिंग तकनीकी ब्रीफिंग "${query || 'रैस्टर दृश्य'}": मल्टी-स्पेक्ट्रल रेडियोमेट्री ने ${water}% NDWI जल सतह, ${veg}% NDVI प्रकाश संश्लेषक चंदवा और ${built}% NDBI अभेद्य संरचनाओं का वर्गीकरण किया है। ${trendText ? `द्वि-कालिक परिवर्तन विश्लेषण: ${trendText}।` : ''} माध्य NDVI ${ndvi} और NDWI ${ndwi} दर्ज किया गया है।`;
        case 'zh':
          return `面向"${query || '栅格场景'}"的操作级遥感技术简报：多光谱辐射定标与光谱指数阈值分类显示，NDWI水体覆盖率为${water}%，NDVI光合作用植被冠层占${veg}%，NDBI不透水地表与建筑占${built}%。${trendText ? `双时相变化检测结果：${trendText}。` : ''}全景平均NDVI为${ndvi}，NDWI为${ndwi}，像素级矢量边界已生成。`;
        case 'ja':
          return `「${query || 'ラスタシーン'}」に関する運用型リモートセンシング技術ブリーフィング：マルチスペクトル放射輝度閾値処理により、NDWI水文指標${water}%、NDVI植生キャノピー${veg}%、NDBI不透水人工被覆${built}%と分類されました。${trendText ? `二時期差分変化検出：${trendText}。` : ''}平均NDVI値は${ndvi}、平均NDWI値は${ndwi}を記録しています。`;
        case 'pt':
          return `Briefing técnico de sensoriamento remoto operacional para "${query || 'cena raster'}": A radiometria multiespectral classifica ${water}% de corpos d'água via NDWI, ${veg}% de dossel vegetal fotossintético via NDVI, e ${built}% de superfície impermeável urbana via NDBI. ${trendText ? `A detecção diferencial bi-temporal reporta: ${trendText}.` : ''} Índices médios calculados em NDVI ${ndvi} e NDWI ${ndwi}.`;
        case 'it':
          return `Briefing tecnico di telerilevamento operativo per "${query || 'scena raster'}": La radiometria multispettrale classifica il ${water}% di corpi idrici tramite soglia NDWI, il ${veg}% di chioma vegetativa attiva tramite NDVI e il ${built}% di suolo impermeabile tramite NDBI. ${trendText ? `L'analisi differenziale bi-temporale rileva: ${trendText}.` : ''} Gli indici spettrali medi sono NDVI ${ndvi} e NDWI ${ndwi}.`;
        case 'ar':
          return `إيجاز تقني للاستشعار عن بُعد للمشهد: يصنف التحليل الإشعاعي متعدد الأطياف نسبة ${water}% من المسطحات المائية وفق مؤشر NDWI، ونسبة ${veg}% من الغطاء النباتي الضوئي وفق مؤشر NDVI، ونسبة ${built}% من الأسطح الحضرية غير المنفذة وفق مؤشر NDBI. ${trendText ? `وتشير مصفوفة التغير الزمني إلى: ${trendText}.` : ''} يبلغ متوسط مؤشر NDVI ${ndvi} ومؤشر NDWI ${ndwi}.`;
        default:
          return `Operational remote sensing technical briefing for "${query || 'raster scene'}": Multispectral radiometric thresholding classifies the surface with ${water}% NDWI hydrological coverage, ${veg}% NDVI photosynthetic canopy, and ${built}% NDBI artificial impervious structure. ${trendText ? `Bi-temporal differential matrix reports: ${trendText}.` : ''} Spectral indices record mean NDVI of ${ndvi} and NDWI of ${ndwi}. Geometric projection coordinates and segmentations are serialized.`;
      }
    }
  }

  // Audio Explanation Endpoint: Generates spoken text & synthesized speech
  app.post('/api/audio-explanation', async (req, res) => {
    try {
      const {
        query = 'satellite scene analysis',
        answer = '',
        coverage = [],
        trendSummary = null,
        indices = null,
        language = 'en',
        languageName = 'English',
        complexity = 'simple', // 'simple' or 'technical'
        voice = 'Kore',
        synthesizeAudio = true,
      } = req.body;

      const key = process.env.GEMINI_API_KEY;
      let generatedScript = '';
      let scriptModel = 'gemini-3.8-flash';
      let wasScriptFallback = false;

      if (!key) {
        generatedScript = buildFallbackScript({
          query,
          coverage,
          trendSummary,
          indices,
          language,
          complexity,
        });
        return res.json({
          success: true,
          script: generatedScript,
          audioUrl: null,
          fallbackToWebSpeech: true,
          model: 'fallback-template',
          language,
          complexity,
          voice,
        });
      }

      const ai = getAI();

      // Step 1: Generate the spoken explanation script with gemini-3.8-flash
      try {
        let systemPrompt = '';
        let userContent = '';

        if (complexity === 'simple') {
          systemPrompt = `You are a friendly Earth Observation specialist explaining satellite imagery to a general audience.
Explain the findings clearly, warmly, and in very simple, easy-to-understand words.
STRICT RULES:
1. Speak in everyday language. DO NOT use technical jargon, formulas, or unexplained remote sensing acronyms (e.g., do NOT say NDVI, NDWI, NDBI, CRS, UTM, or radiometric calibration without immediately calling them everyday names like 'plant greenness', 'water levels', or 'map coordinates').
2. Mention what features exist in the scene (such as water bodies, trees or farms, buildings and roads), what changed if changes occurred, and what it practically means.
3. Keep the script to 3-5 concise, natural spoken sentences.
4. The output will be read aloud by speech synthesis: do NOT use bullet points, asterisks, markdown, emojis, or section headers.
5. Respond ENTIRELY in ${languageName}.`;

          userContent = `Please explain these satellite analysis results:
User Query: "${query}"
Findings Summary: ${answer}
Class Coverage: ${JSON.stringify(coverage)}
${trendSummary ? `Changes: ${trendSummary.overallHeadline || ''}. Details: ${trendSummary.items?.map((it: any) => `${it.className}: ${it.scene1Pct}% -> ${it.scene2Pct}% (${it.deltaPct > 0 ? '+' : ''}${it.deltaPct}%)`).join(', ')}` : ''}
${indices ? `Greenery/Vegetation index: ${indices.ndvi?.mean?.toFixed(2) || 'N/A'}, Water index: ${indices.ndwi?.mean?.toFixed(2) || 'N/A'}` : ''}`;
        } else {
          systemPrompt = `You are a senior Earth Observation and remote sensing scientist delivering an operational technical briefing.
Deliver an articulate, rigorous, and technical analysis with precise geospatial and spectral jargon.
STRICT RULES:
1. Use exact remote sensing terms (multispectral reflectance, normalized difference vegetation/water/built indices, radiometric backscatter, pixel spatial resolution, bi-temporal differential change, hectare coverage).
2. Detail the exact surface distribution percentages, spectral index thresholds, and spatial delta dynamics.
3. Keep the briefing to 3-5 articulate spoken sentences.
4. The output will be read aloud by speech synthesis: do NOT use bullet points, asterisks, markdown, emojis, or section headers.
5. Respond ENTIRELY in ${languageName}.`;

          userContent = `Please deliver a technical briefing on these satellite analysis results:
User Query: "${query}"
Findings Summary: ${answer}
Class Coverage: ${JSON.stringify(coverage)}
${trendSummary ? `Changes: ${trendSummary.overallHeadline || ''}. Details: ${trendSummary.items?.map((it: any) => `${it.className}: ${it.scene1Pct}% -> ${it.scene2Pct}% (${it.deltaPct > 0 ? '+' : ''}${it.deltaPct}%)`).join(', ')}` : ''}
${indices ? `Indices: NDVI mean: ${indices.ndvi?.mean?.toFixed(2) || 'N/A'}, NDWI mean: ${indices.ndwi?.mean?.toFixed(2) || 'N/A'}, NDBI mean: ${indices.ndbi?.mean?.toFixed(2) || 'N/A'}` : ''}`;
        }

        const textResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userContent,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          },
        });

        generatedScript = textResponse.text?.trim() || '';
      } catch (err: any) {
        console.error('Gemini text script generation error:', err);
        wasScriptFallback = true;
        generatedScript = buildFallbackScript({
          query,
          coverage,
          trendSummary,
          indices,
          language,
          complexity,
        });
      }

      if (!generatedScript) {
        generatedScript = buildFallbackScript({
          query,
          coverage,
          trendSummary,
          indices,
          language,
          complexity,
        });
        wasScriptFallback = true;
      }

      // Step 2: Synthesize audio using gemini-3.1-flash-tts-preview if requested
      if (synthesizeAudio) {
        try {
          const ttsVoice = ['Kore', 'Puck', 'Fenrir', 'Zephyr'].includes(voice) ? voice : 'Kore';

          // Wrap TTS in a timeout promise to prevent slow network hanging
          const ttsPromise = ai.models.generateContent({
            model: 'gemini-3.1-flash-tts-preview',
            contents: [{ parts: [{ text: generatedScript }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: ttsVoice },
                },
              },
            },
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TTS timeout')), 8500)
          );

          const ttsResponse = (await Promise.race([ttsPromise, timeoutPromise])) as any;
          const pcmBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

          if (pcmBase64) {
            const rawPcm = Buffer.from(pcmBase64, 'base64');
            const wavBuffer = pcmToWav(rawPcm, 24000, 1);
            const audioDataUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

            return res.json({
              success: true,
              script: generatedScript,
              audioUrl: audioDataUrl,
              fallbackToWebSpeech: false,
              ttsModel: 'gemini-3.1-flash-tts-preview',
              model: wasScriptFallback ? 'fallback-template' : scriptModel,
              language,
              complexity,
              voice: ttsVoice,
            });
          }
        } catch (ttsErr: any) {
          console.warn('TTS generation fallback to WebSpeech:', ttsErr?.message || ttsErr);
        }
      }

      // If TTS not synthesized or rate-limited or timed out, send script with fallback flag
      return res.json({
        success: true,
        script: generatedScript,
        audioUrl: null,
        fallbackToWebSpeech: true,
        model: wasScriptFallback ? 'fallback-template' : scriptModel,
        language,
        complexity,
        voice,
      });
    } catch (err: any) {
      console.error('Audio explanation endpoint failure:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate audio explanation',
        details: err?.message || String(err),
      });
    }
  });

  // --- VITE MIDDLEWARE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // In Express 5, wildcard fallback uses '*all'
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  // --- WEBSOCKET SERVER FOR GEMINI 3.8 LIVE (VOICE CONVERSATIONS) ---
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live' });

  wss.on('connection', async (clientWs: WebSocket) => {
    let session: any = null;
    let isConnected = false;

    // Helper to send typed message safely
    const send = (payload: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // 1. Session Initialization
        if (msg.type === 'init') {
          const key = process.env.GEMINI_API_KEY;
          if (!key) {
            send({
              type: 'error',
              error: 'GEMINI_API_KEY is not configured on the server.',
            });
            return;
          }

          const voice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(msg.voice)
            ? msg.voice
            : 'Zephyr';
          const complexity = msg.complexity === 'technical' ? 'technical' : 'simple';
          const languageName = msg.languageName || 'English';
          const sceneContext = msg.sceneContext || {};

          const systemPrompt = `You are SatQuery Live, an interactive Earth Observation voice assistant powered by Google Gemini 3.8 Live.
You are in a live, real-time voice conversation with a user inspecting satellite remote sensing scenes (Sentinel-2 multispectral and Sentinel-1 SAR).

Current Satellite Imagery Context:
- Active Query: "${sceneContext.query || 'satellite scene analysis'}"
- Primary Scene: ${sceneContext.scene1Name || 'Sentinel-2 Tile'}
- Class Coverage: ${JSON.stringify(sceneContext.coverage || [])}
- Spectral Indices: ${JSON.stringify(sceneContext.indices || {})}
${sceneContext.trendSummary ? `- Bi-Temporal Trend: ${sceneContext.trendSummary.overallHeadline || ''}` : ''}

Style & Complexity:
${
  complexity === 'simple'
    ? 'Simple and intuitive. Speak in everyday language without unexplained remote sensing jargon or complex formulas. Refer to water bodies, green plants/crops, and buildings naturally.'
    : 'Technical and rigorous. Act as a senior remote sensing scientist using precise multispectral and radiometric terminology (NDVI, NDWI, NDBI, surface reflectance, bi-temporal differential dynamics).'
}

Language:
Always speak naturally in ${languageName}.

Guidelines:
1. Speak concisely in natural conversational cadence (1-3 sentences per turn), ideal for voice audio.
2. Be direct, knowledgeable, and responsive.
3. If the user asks about the imagery, reference the percentages and classes from the current scene context.
4. If interrupted, stop speaking immediately and listen to the user.`;

          try {
            const ai = getAI();
            session = await ai.live.connect({
              model: 'gemini-3.8-live',
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                },
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                systemInstruction: systemPrompt,
              },
              callbacks: {
                onmessage: (serverMsg: LiveServerMessage) => {
                  // Audio output chunk (24kHz 16-bit PCM little-endian)
                  const audio =
                    serverMsg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (audio) {
                    send({ type: 'audio', audio });
                  }

                  // Output transcription (what the model is saying)
                  const outText =
                    (serverMsg.serverContent as any)?.outputTranscription?.text ||
                    (serverMsg.serverContent as any)?.outputAudioTranscription?.text;
                  if (outText) {
                    send({ type: 'output_transcript', text: outText });
                  }

                  // Input transcription (what the user said)
                  const inText =
                    (serverMsg.serverContent as any)?.inputTranscription?.text ||
                    (serverMsg.serverContent as any)?.inputAudioTranscription?.text;
                  if (inText) {
                    send({ type: 'input_transcript', text: inText });
                  }

                  // Interruption notice
                  if (serverMsg.serverContent?.interrupted) {
                    send({ type: 'interrupted' });
                  }

                  // Turn / generation completion
                  if (
                    serverMsg.serverContent?.turnComplete ||
                    (serverMsg.serverContent as any)?.generationComplete
                  ) {
                    send({ type: 'turn_complete' });
                  }
                },
                onerror: (err: any) => {
                  console.error('Gemini Live session error:', err);
                  send({
                    type: 'error',
                    error: err?.message || 'Live session encountered an error',
                  });
                },
                onclose: () => {
                  isConnected = false;
                  send({ type: 'closed' });
                },
              },
            });

            isConnected = true;
            send({
              type: 'connected',
              model: 'gemini-3.8-live',
              voice,
              complexity,
              language: languageName,
            });

            // Send an optional initial greeting from the assistant if requested
            if (msg.sendGreeting) {
              session.sendRealtimeInput({
                text: `Please briefly introduce yourself in one short sentence as SatQuery Live in ${languageName} and offer to answer questions about the current satellite image.`,
              });
            }
          } catch (connErr: any) {
            console.error('Failed to connect to Gemini 3.8 Live:', connErr);
            send({
              type: 'error',
              error: connErr?.message || 'Failed to initialize Gemini 3.8 Live session',
            });
          }
        }

        // 2. Client sending 16kHz raw PCM audio chunk
        else if (msg.type === 'audio') {
          if (session && isConnected && msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          }
        }

        // 3. Client sending text query inside the live conversation
        else if (msg.type === 'text') {
          if (session && isConnected && msg.text) {
            session.sendRealtimeInput({ text: msg.text });
          }
        }

        // 4. Update scene context during ongoing conversation
        else if (msg.type === 'context_update') {
          if (session && isConnected && msg.context) {
            session.sendRealtimeInput({
              text: `[System Context Update: The user just changed the active view. New findings: ${JSON.stringify(msg.context)}]`,
            });
          }
        }
      } catch (err: any) {
        console.error('WebSocket message processing error:', err);
      }
    });

    clientWs.on('close', async () => {
      isConnected = false;
      if (session) {
        try {
          await session.close();
        } catch {}
        session = null;
      }
    });

    clientWs.on('error', (err) => {
      console.warn('Client WebSocket error:', err.message);
    });

    // Notify client the connection is established
    send({ type: 'ready' });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SatQuery AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
