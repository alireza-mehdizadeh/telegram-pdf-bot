"""Builds the copy-safe Vazirmatn fonts in fonts/ from the vazirmatn npm package.

Chrome writes a PDF's copy/paste text from the font, and two things in
Vazirmatn made copied Persian text wrong. This script changes only how the
text maps back to letters; what the PDF looks like stays the same.

1. Legacy code points. The character map also points the old Arabic
   "presentation form" code points (U+FB50-FDFF, U+FE70-FEFF) at the joined
   letter shapes, so copying gave those legacy characters (e.g. U+FEFC for
   "لا") instead of normal Persian letters. Those entries are removed.

2. Lam-alef ligatures. "لا" (and لأ لآ لإ) is drawn as one glyph standing for
   two letters. PDF viewers that reverse right-to-left text (Chrome, Firefox,
   most Android apps) reverse that glyph's two letters too, so "سلام" was
   copied as "سالم". Each such ligature is rewritten so lam becomes the
   ligature shape and alef becomes an invisible zero-width glyph: the same
   picture, but one glyph per letter, which every viewer copies correctly.

Usage (needs: pip install fonttools brotli):
    python3 scripts/build-fonts.py
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot
from fontTools.ttLib.tables._g_l_y_f import Glyph

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "node_modules" / "vazirmatn" / "fonts" / "webfonts"
OUT = ROOT / "fonts"

PRESENTATION_FORMS = [(0xFB50, 0xFDFF), (0xFE70, 0xFEFF)]
RIGHT_TO_LEFT = 0x0001
MARK_CLASS = 3


def is_presentation_form(code):
    return any(start <= code <= end for start, end in PRESENTATION_FORMS)


def remove_presentation_forms(font):
    removed = 0
    for table in font["cmap"].tables:
        for code in [c for c in table.cmap if is_presentation_form(c)]:
            del table.cmap[code]
            removed += 1
    return removed


def coverage(glyphs):
    cov = ot.Coverage()
    cov.glyphs = list(glyphs)
    return cov


def single_subst_lookup(mapping):
    sub = ot.SingleSubst()
    sub.mapping = dict(mapping)
    lookup = ot.Lookup()
    lookup.LookupType = 1
    lookup.LookupFlag = 0
    lookup.SubTable = [sub]
    lookup.SubTableCount = 1
    return lookup


def ligature_subtables(lookup):
    if lookup.LookupType == 4:
        return lookup.SubTable
    if lookup.LookupType == 7 and lookup.SubTable[0].ExtensionLookupType == 4:
        return [s.ExtSubTable for s in lookup.SubTable]
    return None


def split_rtl_ligatures(font):
    """Rewrites right-to-left letter ligatures as one-glyph-per-letter rules."""
    gsub = font["GSUB"].table
    gdef = font["GDEF"].table.GlyphClassDef.classDefs
    lookups = gsub.LookupList.Lookup

    # Right-to-left ligatures of letters only (not accents or spacing marks).
    targets = []
    for index, lookup in enumerate(lookups):
        subtables = ligature_subtables(lookup)
        if subtables is None or not lookup.LookupFlag & RIGHT_TO_LEFT:
            continue
        rules = [
            (first, lig)
            for st in subtables
            for first, ligs in st.ligatures.items()
            for lig in ligs
        ]
        if all(gdef.get(g) != MARK_CLASS and g != "space" for first, lig in rules for g in [first, *lig.Component]):
            targets.append((index, rules))

    # One invisible zero-width glyph per component glyph, so each one still
    # stands for exactly one letter.
    empty_for = {}
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()
    for _, rules in targets:
        for _, lig in rules:
            for comp in lig.Component:
                if comp not in empty_for:
                    name = f"{comp}.ligpart"
                    empty_for[comp] = name
                    glyf.glyphs[name] = Glyph()
                    hmtx.metrics[name] = (0, 0)
                    order.append(name)
                    gdef[name] = MARK_CLASS  # skipped by later rules that ignore marks
    font.setGlyphOrder(order)
    glyf.glyphOrder = order

    # Shared helper lookups: "first glyph -> ligature shape" (one per shape)
    # and "component -> its empty glyph".
    empty_index = len(lookups)
    lookups.append(single_subst_lookup(empty_for))
    shape_index = {}
    for _, rules in targets:
        for first, lig in rules:
            shape = lig.LigGlyph
            if shape not in shape_index:
                shape_index[shape] = len(lookups)
                lookups.append(single_subst_lookup({}))
            lookups[shape_index[shape]].SubTable[0].mapping[first] = shape

    # Replace each ligature lookup with an equivalent contextual lookup, keeping
    # the rule order (longest match first) and the original lookup flags.
    for index, rules in targets:
        subtables = []
        for first, lig in rules:
            st = ot.ChainContextSubst()
            st.Format = 3
            st.BacktrackCoverage = []
            st.LookAheadCoverage = []
            st.InputCoverage = [coverage([g]) for g in [first, *lig.Component]]
            records = []
            for position, lookup_index in [(0, shape_index[lig.LigGlyph])] + [
                (i, empty_index) for i in range(1, len(lig.Component) + 1)
            ]:
                record = ot.SubstLookupRecord()
                record.SequenceIndex = position
                record.LookupListIndex = lookup_index
                records.append(record)
            st.SubstLookupRecord = records
            st.SubstCount = len(records)
            subtables.append(st)
        lookup = lookups[index]
        lookup.LookupType = 6
        lookup.SubTable = subtables
        lookup.SubTableCount = len(subtables)

    gsub.LookupList.LookupCount = len(lookups)
    return sum(len(rules) for _, rules in targets)


def main():
    OUT.mkdir(exist_ok=True)
    for weight in ("Regular", "Bold"):
        font = TTFont(SOURCE / f"Vazirmatn-{weight}.woff2")
        removed = remove_presentation_forms(font)
        split = split_rtl_ligatures(font)
        font.flavor = "woff2"
        target = OUT / f"Vazirmatn-{weight}.woff2"
        font.save(target)
        print(f"{target.relative_to(ROOT)}: removed {removed} legacy mappings, split {split} ligatures")
    (OUT / "OFL.txt").write_text((SOURCE.parent.parent / "OFL.txt").read_text())


if __name__ == "__main__":
    main()
