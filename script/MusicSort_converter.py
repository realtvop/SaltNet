import sys
import xml.etree.ElementTree as ET
import json

if len(sys.argv) < 2:
    print("Usage: python MusicSort_converter.py <MusicSort.xml>")
    sys.exit(1)

xml_path = sys.argv[1]
json_path = "src/assets/music/sort.json"

try:
    tree = ET.parse(xml_path)
    root = tree.getroot()
except Exception as e:
    print(f"Failed to parse XML: {e}")
    sys.exit(1)

ids = []
for string_id in root.findall('.//SortList/StringID'):
    id_elem = string_id.find('id')
    if id_elem is not None and id_elem.text is not None:
        ids.append(int(id_elem.text))

with open(json_path, 'w', encoding='utf-8', newline='') as f:
    json.dump(ids, f, ensure_ascii=False, separators=(',', ':'))
print(f"已更新曲目排序，共 {len(ids)} 首。输出文件: {json_path}")
