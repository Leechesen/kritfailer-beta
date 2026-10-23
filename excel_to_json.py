"""Convert the source workbook into validated, versioned application data."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import warnings

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent
EXCEL_FILE = ROOT / "crit_fails.xlsx"
OUTPUT_JSON = ROOT / "crit_fails.json"
REQUIRED = {
    "Útok": {"attack_type", "severity", "effect"},
    "Obrana": {"severity", "effect"},
    "Skill": {"skill", "skill_category", "severity", "effect"},
}


def text(value):
    return "" if value is None else str(value).strip()


def normalize_severity(value):
    return text(value) or None


def parse_weight(value, location):
    if value is None or text(value) == "":
        return 1
    try:
        weight = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{location}: weight musí být kladné číslo, zadáno {value!r}.") from error
    if isinstance(value, bool) or not math.isfinite(weight) or weight <= 0:
        raise ValueError(f"{location}: weight musí být konečné číslo větší než nula.")
    return int(weight) if weight.is_integer() else weight


def convert_sheet(action, headers, rows):
    headers = [text(value) for value in headers]
    missing = REQUIRED[action] - set(headers)
    if missing:
        raise ValueError(f"List {action}: chybí sloupce {', '.join(sorted(missing))}.")
    result, count = {}, 0
    for number, values in enumerate(rows, start=2):
        row = dict(zip(headers, values))
        if not any(text(value) for value in values):
            continue
        if all(text(row.get(key)).casefold() == key.casefold() for key in REQUIRED[action]):
            warnings.warn(f"List {action}, řádek {number}: přeskočena opakovaná hlavička.", stacklevel=2)
            continue
        location = f"List {action}, řádek {number}"
        if not text(row.get("effect")) or not text(row.get("severity")):
            raise ValueError(f"{location}: vyplň effect a severity, nebo nech celý řádek prázdný.")
        entry = {"effect": text(row["effect"]), "roleplay": [text(row.get("roleplay_1")), text(row.get("roleplay_2"))], "weight": parse_weight(row.get("weight"), location)}
        severity = text(row["severity"])
        if len(entry["effect"]) > 4000 or any(len(rp) > 4000 for rp in entry["roleplay"]):
            raise ValueError(f"{location}: text výsledku může mít nejvýše 4000 znaků.")
        if len(severity) > 80:
            raise ValueError(f"{location}: severity může mít nejvýše 80 znaků.")
        if action == "Útok":
            attack = text(row.get("attack_type"))
            if not attack:
                raise ValueError(f"{location}: chybí attack_type.")
            result.setdefault(attack, {}).setdefault(severity, []).append(entry)
        elif action == "Skill":
            attribute, skill = text(row.get("skill_category")), text(row.get("skill"))
            if not attribute or not skill:
                raise ValueError(f"{location}: vyplň skill a skill_category.")
            result.setdefault(attribute, {}).setdefault(skill, {}).setdefault(severity, []).append(entry)
        else:
            result.setdefault(severity, []).append(entry)
        count += 1
    return result, count


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def build_json_from_excel(excel_path=None, output_path=None, meta_path=None):
    source = Path(excel_path or EXCEL_FILE)
    output = Path(output_path or OUTPUT_JSON)
    meta_output = Path(meta_path) if meta_path else output.with_name(output.stem + ".meta.json")
    data, counts = {}, {}
    workbook = load_workbook(source, read_only=True, data_only=True)
    try:
        for sheet in workbook:
            action = sheet.title.strip()
            if action not in REQUIRED:
                warnings.warn(f"List {sheet.title!r} není tabulka výsledků, přeskakuji.", stacklevel=2)
                continue
            rows = iter(sheet.iter_rows(values_only=True))
            data[action], counts[action] = convert_sheet(action, next(rows, ()), rows)
    finally:
        workbook.close()
    if not data or not sum(counts.values()):
        raise ValueError("Excel neobsahuje žádné platné výsledky.")
    content = (json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    metadata = {"schemaVersion": 1, "version": hashlib.sha256(content).hexdigest(), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "entries": sum(counts.values()), "counts": counts}
    # Validate everything before replacing the published files.
    atomic_write(output, content)
    atomic_write(meta_output, (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"Vygenerováno {metadata['entries']} výsledků z {source.name}.")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=EXCEL_FILE)
    parser.add_argument("--output", type=Path, default=OUTPUT_JSON)
    parser.add_argument("--meta", type=Path)
    args = parser.parse_args()
    build_json_from_excel(args.input, args.output, args.meta)
