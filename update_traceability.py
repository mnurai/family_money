
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

PASS, WIP, OK, BAD = "⬜", "🟨", "✅", "❌"


def load_subcases(doc11_path):
    subs = defaultdict(set)
    plain = set()
    for line in open(doc11_path, encoding="utf-8"):
        m = re.match(r"\|\s*(TC-N?\d{2})(?:\.(\d+))?\s*\|", line)
        if not m:
            continue
        if m.group(2):
            subs[m.group(1)].add(f"{m.group(1)}.{m.group(2)}")
        else:
            plain.add(m.group(1))
    for p in plain:
        subs.setdefault(p, {p})          # parents without sub-cases test themselves
    return subs


def load_results(xml_path, allow_reference=False):
    results = defaultdict(list)           # TC id -> [True/False per test]
    for case in ET.parse(xml_path).getroot().iter("testcase"):
        for prop in case.iter("property"):
            if prop.get("name") == "adapter" and prop.get("value") == "reference" \
                    and not allow_reference:
                sys.exit("Refusing: this run used the in-memory reference model, which proves "
                         "nothing about the real system. Run with FBT_ADAPTER=... "
                         "(or pass --allow-reference to try the script).")
        failed = case.find("failure") is not None or case.find("error") is not None
        skipped = case.find("skipped") is not None
        if skipped:
            continue
        for prop in case.iter("property"):
            if prop.get("name") == "tc":
                results[prop.get("value")].append(not failed)
    return results


def decide(parent, subs, results, current):
    states = []
    for sub in sorted(subs[parent]):
        runs = results.get(sub, []) + results.get(parent, [])
        states.append(None if not runs else all(runs))
    if any(s is False for s in states):
        return BAD
    if all(s is True for s in states):
        return OK
    if any(s is True for s in states):
        return WIP
    return current


def main(argv):
    dry = "--dry-run" in argv
    xml_path, matrix_path, doc11_path = [a for a in argv if not a.startswith("--")][:3]
    subs = load_subcases(doc11_path)
    results = load_results(xml_path, "--allow-reference" in argv)
    out, changes = [], []
    for line in open(matrix_path, encoding="utf-8"):
        m = re.search(r"\|\s*(TC-N?\d{2})\s*\|\s*(⬜|🟨|✅|❌)\s*\|\s*$", line)
        if m and m.group(1) in subs:
            new = decide(m.group(1), subs, results, m.group(2))
            if new != m.group(2):
                changes.append((m.group(1), m.group(2), new))
                line = line[:m.start(2)] + new + line[m.end(2):]
        out.append(line)
    for tc, old, new in changes:
        print(f"{tc}: {old} -> {new}")
    print(f"{len(changes)} status(es) changed" + (" (dry run, file not written)" if dry else ""))
    if not dry:
        open(matrix_path, "w", encoding="utf-8").writelines(out)


if __name__ == "__main__":
    main(sys.argv[1:])
