*QR code generation parameters:
1. Mode (i.e. data type): byte, alphanumeric, numeric, kanji, ECI
2. Version (i.e. size): 1 through 40
3. Error correction level: L, M, Q, H
4. Mask: 0 through 7
5. (Ignoring) Structured append mode
6. (Ignoring) FNC1 mode

*Other parameters:
6. Non-standard padding
7. Non-standard null-terminator
8. (Ignore) Add UTF byte order mark (BOM), 0xEF 0xBB 0xBF

*Algorithm for QR code generation:
See: https://www.thonky.com/qr-code-tutorial/introduction
1. Encode data into bit stream. The maximum length of this bitstream is defined by the above parameters.
2. Apply Reed-Soloman error correction
3. Structure the message (headers, ECI, null-terminator, padding)
4. Modual placment
5. Mask the data
6. Add format and version information
