import unittest

import numpy as np
from PIL import Image

from satquery_router import classify_task, extract_grounding_phrase
from satquery_vision import change_boxes_from_mask, change_mask


class RouterTests(unittest.TestCase):
    def test_single_image_defaults_to_vqa(self):
        plan = classify_task("Tell me about this scene", 1, False)
        self.assertEqual(plan["task"], "vqa")

    def test_describe_routes_to_caption(self):
        plan = classify_task("Describe the land-cover in this image.", 1, False)
        self.assertEqual(plan["task"], "caption")

    def test_highlight_routes_to_grounding_and_extracts_phrase(self):
        plan = classify_task("Highlight the water body in this image.", 1, False)
        self.assertEqual(plan["task"], "grounding")
        self.assertEqual(plan["grounding_phrase"], "water body")
        self.assertTrue(plan["also_caption"])

    def test_two_images_are_change_analysis(self):
        plan = classify_task("What changed between these two dates, and where?", 2, False)
        self.assertEqual(plan["task"], "change_analysis")

    def test_sar_flag_routes_to_fusion(self):
        plan = classify_task("Identify built-up regions", 2, True)
        self.assertEqual(plan["task"], "fusion_analysis")

    def test_fusion_keywords_without_checkbox(self):
        plan = classify_task("Use optical and SAR together", 2, False)
        self.assertEqual(plan["task"], "fusion_analysis")

    def test_how_many_is_vqa(self):
        plan = classify_task("How many buildings are visible?", 1, False)
        self.assertEqual(plan["task"], "vqa")

    def test_extract_where_is(self):
        self.assertEqual(extract_grounding_phrase("Where is the river?"), "river")


class ChangeVizTests(unittest.TestCase):
    def test_change_mask_and_boxes(self):
        a = Image.fromarray(np.zeros((64, 64, 3), dtype=np.uint8))
        arr = np.zeros((64, 64, 3), dtype=np.uint8)
        arr[10:40, 10:40] = 255
        b = Image.fromarray(arr)
        mask, pct = change_mask(a, b, size=64)
        self.assertGreater(pct, 10)
        boxes = change_boxes_from_mask(mask, a.size, min_area=10)
        self.assertGreaterEqual(len(boxes), 1)


if __name__ == "__main__":
    unittest.main()
