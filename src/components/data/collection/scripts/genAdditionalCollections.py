import json
from pathlib import Path
from xml.etree import ElementTree as ET


def load_character(xml_path: Path) -> dict:
	tree = ET.parse(xml_path)
	root = tree.getroot()

	def require_text(xpath: str) -> str:
		node = root.find(xpath)
		if node is None or node.text is None:
			raise ValueError(f"Missing {xpath} in {xml_path}")
		return node.text.strip()

	char_id = int(require_text("name/id"))
	name = require_text("name/str")
	genre = require_text("genre/str")
	update_raw = root.findtext("netOpenName/id") or "0"
	try:
		update_time = int(update_raw)
	except ValueError:
		update_time = 0

	return {
		"id": char_id,
		"name": name,
		"genre": genre,
		"updateTime": update_time,
	}


def main() -> None:
	base_dir = Path(__file__).resolve().parent
	chara_dir = base_dir / "chara"
	xml_files = sorted(chara_dir.glob("chara*/Chara.xml"))

	characters = [load_character(xml_path) for xml_path in xml_files]
	characters.sort(key=lambda item: item["id"])
	genres = list(dict.fromkeys(character["genre"] for character in characters))

	output = {
		"characters": characters,
		"genres": {"characters": genres},
	}

	output_path = base_dir / "chara.json"
	output_path.write_text(
		json.dumps(output, ensure_ascii=False, indent=4) + "\n",
		encoding="utf-8",
	)


if __name__ == "__main__":
	main()
