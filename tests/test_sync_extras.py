import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import sync_server


class WorkbookExtrasTest(unittest.TestCase):
    def test_explicit_empty_values_clear_previous_workbook_metadata(self):
        current = {
            'styles': {'row-1|name': {'font': {'bold': True}}},
            'row_heights': {2: 32},
            'column_widths': {'name': 28},
            'layouts': {'column:name': {'direction': 'column'}},
            'merges': ['B2:C2'],
        }
        result = sync_server.merge_workbook_extras(current, {
            'styles': {},
            'rowHeights': {},
            'columnWidths': {},
            'layouts': {},
            'merges': [],
        })
        self.assertEqual(result, {'styles': {}, 'row_heights': {}, 'column_widths': {}, 'layouts': {}, 'merges': []})

    def test_explicit_merges_replace_previous_ranges(self):
        current = {'styles': {}, 'row_heights': {}, 'column_widths': {}, 'layouts': {}, 'merges': ['B2:C2']}
        result = sync_server.merge_workbook_extras(current, {'merges': ['D3:F3']})
        self.assertEqual(result['merges'], ['D3:F3'])

    def test_missing_values_keep_existing_workbook_metadata(self):
        current = {
            'styles': {'row-1|name': {'font': {'bold': True}}},
            'row_heights': {2: 32},
            'column_widths': {'name': 28},
            'layouts': {'column:name': {'direction': 'column'}},
            'merges': ['B2:C2'],
        }
        result = sync_server.merge_workbook_extras(current, {})
        self.assertEqual(result, current)

    def test_missing_merges_keep_existing_ranges(self):
        current = {'styles': {}, 'row_heights': {}, 'column_widths': {}, 'layouts': {}, 'merges': ['B2:C2']}
        result = sync_server.merge_workbook_extras(current, {})
        self.assertEqual(result['merges'], ['B2:C2'])


if __name__ == '__main__':
    unittest.main()
