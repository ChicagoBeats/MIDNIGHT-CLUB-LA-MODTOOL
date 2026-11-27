# MCLA save format notes

Decrypted payload is 537,428 bytes (PS3 files on disk are padded to 537,440). Xbox 360 `mc4.sav` is an STFS "CON " package holding one file with the same payload.

## Car records
- Record `i` starts at `26452 + 8176 * i`; the car name (ASCII, 0xCD padded) is at offset 0. All offsets below are relative to the name.

## Wheel block (offset 2141)
| Bytes | Meaning |
|---|---|
| 0-1 | Ride height front/rear |
| 2-3 | Tire width front/rear |
| 4-5 | Rim size front/rear (signed byte) |
| 6-7 | Tire profile front/rear |
| 8-9 | Unused (00) |
| 10 | Rim type |
| 11 | Tire type |
| 12 | Unknown |
| 13+ | Licence plate text |

## Light table (offset 595, 19 entries, stride 48)
`[colour A: 3 x float32 BE][7F800001][colour B: 3 x float32 BE][7F800001][mode: u32][12 bytes]`
Stock xenon headlights use brightness ~4.0 (values above 1.0 are allowed). Mode 0-0x10 are light roles; FFFFFFFD/FF/FE/F3 are flashing/off variants noted by the community.

## Other
- `+63..75`: 13 wheel material bytes
- `+92..98`: rim/tire model ID row (spinner experiment edits +94 and +96)

## Xbox STFS notes
Block address: `base + 0x1000 * (n + 2 * (n // 0xAA + 1))`, `base = (header_size + 0xFFF) & ~0xFFF`. The file table is block 0.
