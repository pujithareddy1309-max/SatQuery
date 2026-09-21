import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from satquery.agent import AgentState, heuristic_plan
from satquery.change import semantic_change
from satquery.demo import _write_s2_geotiff
from satquery.geoexport import export_bundle, mask_area, masks_to_geojson
from satquery.indices import compute_index, ndvi, ndwi, rgb_proxy_bands
from satquery.raster import load_scene_from_path, scene_from_pil
from satquery.segmentation import run_segmentation
from satquery.validation import validate_spatial_extent


class IndexTests(unittest.TestCase):
    def test_ndvi_water_is_low(self):
        red = np.ones((8, 8)) * 0.4
        nir = np.ones((8, 8)) * 0.1
        self.assertLess(float(ndvi(nir, red).mean()), 0)

    def test_ndwi_water_is_high(self):
        green = np.ones((8, 8)) * 0.6
        nir = np.ones((8, 8)) * 0.1
        self.assertGreater(float(ndwi(green, nir).mean()), 0.4)

    def test_rgb_proxy_indices(self):
        img = Image.fromarray(np.full((32, 32, 3), (40, 180, 40), dtype=np.uint8))
        bands = rgb_proxy_bands(img)
        result = compute_index(bands, "ndvi")
        self.assertEqual(result.name, "NDVI")
        self.assertEqual(result.array.shape, (32, 32))


class RasterValidationTests(unittest.TestCase):
    def test_geotiff_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            t1 = Path(tmp) / "t1.tif"
            t2 = Path(tmp) / "t2.tif"
            _write_s2_geotiff(t1, "forest", 1)
            _write_s2_geotiff(t2, "flooded", 2)
            a = load_scene_from_path(str(t1))
            b = load_scene_from_path(str(t2))
            self.assertTrue(a.georeferenced)
            self.assertIn("B08", a.bands)
            report = validate_spatial_extent(a, b)
            self.assertTrue(report["valid"])
            self.assertTrue(report["crs_match"])
            self.assertTrue(report["spatial_overlap"])

    def test_pil_scene_warns_not_georeferenced(self):
        img = Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8))
        scene = scene_from_pil(img)
        report = validate_spatial_extent(scene)
        self.assertTrue(report["valid"])
        self.assertTrue(any("georeferenced" in w.lower() for w in report["warnings"]))


class ChangeAndSegTests(unittest.TestCase):
    def test_semantic_change_flood(self):
        with tempfile.TemporaryDirectory() as tmp:
            t1 = Path(tmp) / "t1.tif"
            t2 = Path(tmp) / "t2.tif"
            _write_s2_geotiff(t1, "forest", 1)
            _write_s2_geotiff(t2, "flooded", 2)
            result = semantic_change(load_scene_from_path(str(t1)), load_scene_from_path(str(t2)))
            self.assertIn("flooding", result["coverage"])
            self.assertGreater(result["coverage"]["flooding"], 1)

    def test_segmentation_coverage(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s2.tif"
            _write_s2_geotiff(path, "water", 3)
            result = run_segmentation(load_scene_from_path(str(path)))
            self.assertIn("water", result["coverage"])
            self.assertTrue(result["boxes"])


class ExportTests(unittest.TestCase):
    def test_geojson_and_area(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s2.tif"
            _write_s2_geotiff(path, "water", 3)
            scene = load_scene_from_path(str(path))
            mask = (compute_index(scene.bands, "ndwi").array > 0).astype(np.uint8)
            area = mask_area(scene, mask)
            self.assertGreater(area["hectares"], 0)
            fc = masks_to_geojson(scene, {"water": mask})
            self.assertEqual(fc["type"], "FeatureCollection")
            bundle = export_bundle(scene, {"water": mask}, tmp)
            self.assertTrue(Path(bundle["geojson"]).exists())
            self.assertTrue(Path(bundle["kml"]).exists())
            self.assertTrue(Path(bundle["zip"]).exists())


class PlannerTests(unittest.TestCase):
    def test_disaster_plan(self):
        img = Image.fromarray(np.zeros((32, 64, 3), dtype=np.uint8))
        state = AgentState("flood extent", scene_from_pil(img), scene_from_pil(img), template="disaster")
        names = [c["name"] for c in heuristic_plan(state.query, state)]
        self.assertIn("validate_spatial_extent", names)
        self.assertIn("calculate_ndwi", names)
        self.assertIn("export_geojson", names)

    def test_single_image_segment_plan(self):
        img = Image.fromarray(np.zeros((32, 64, 3), dtype=np.uint8))
        state = AgentState("highlight the water body", scene_from_pil(img))
        names = [c["name"] for c in heuristic_plan(state.query, state)]
        self.assertIn("run_grounding", names)


if __name__ == "__main__":
    unittest.main()
