# voice-parse module plan

## Purpose
Parse a raw voice transcript into structured grocery entry fields: item name, quantity, unit, and price.

## Regex approach

### Quantity + unit token
One pass over the trimmed transcript. The quantity regex captures an integer or decimal (`\d+(?:\.\d+)?`) immediately followed (optional whitespace) by a unit keyword. The match is removed from the working string.

```
/(\d+(?:\.\d+)?)\s*(kilo|kilos|kg|gramo|grams|g|litro|liter|liters|L|ml|milliliter|piraso|piece|pieces|pcs|dosena|dozen)\b/i
```

### Unit map
| spoken word(s) | Unit value |
|---|---|
| kilo, kilos, kg | 'kg' |
| gramo, grams, g | 'g' |
| litro, liter, liters, L | 'L' |
| ml, milliliter | 'ml' |
| piraso, piece, pieces, pcs | 'piraso' |
| dosena, dozen | 'dosena' |

### Price token
Two strategies tried in order:
1. Number preceded by price marker: `(?:piso|pesos?|₱)\s*(\d+(?:\.\d+)?)` or `(\d+(?:\.\d+)?)\s*(?:piso|pesos?)`  — case-insensitive.
2. Fallback: last standalone number in the remaining string (after qty/unit removal) if no marker found.

The price token (marker + number or number + marker) is removed from the working string.

### itemName
All remaining text after removing qty+unit token and price token, collapsed whitespace, trimmed.

## Future extension point — Tagalog number words (NOT v1)
The following Tagalog number words map to digits and must be documented here as a future extension:
- dalawa = 2
- tatlo = 3
- apat = 4
- lima = 5
- anim = 6
- pito = 7
- walo = 8
- siyam = 9
- sampu = 10

## Test cases

| input | qty | unit | price | itemName |
|---|---|---|---|---|
| "2 kilo repolyo 50 piso" | 2 | 'kg' | 50 | 'repolyo' |
| "repolyo 50 piso" | null | null | 50 | 'repolyo' |
| "repolyo" | null | null | null | 'repolyo' |
| "" | null | null | null | '' |
| "   " | null | null | null | '' |
| "1.5 kg sibuyas 80 pesos" | 1.5 | 'kg' | 80 | 'sibuyas' |
| "kamatis ₱80" | null | null | 80 | 'kamatis' |
| "3 piraso itlog 20 piso" | 3 | 'piraso' | 20 | 'itlog' |
| "2 kilos kamatis" | 2 | 'kg' | null | 'kamatis' |
| "100 gramo luya 35 piso" | 100 | 'g' | 35 | 'luya' |
| "1 dosena itlog" | 1 | 'dosena' | null | 'itlog' |
| matchedItem found | — | — | — | searchLibrary returns Item |
| matchedItem not found | — | — | — | searchLibrary returns [] |

## Edge cases
- Decimal quantities: "1.5 kg"
- Price marker before number: "₱80 kamatis"
- Price marker after number: "kamatis 80 piso"
- No price marker, last number used: "kamatis 80" → price=80
- Extra whitespace between tokens
- Mixed case unit words: "Kilo", "KG"
- `deps` omitted entirely → matchedItem null
- `searchLibrary` returns empty array → matchedItem null
