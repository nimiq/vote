// from https://github.com/nimiq/core-js/blob/3e6cb39625a278dcd9f4406b9ed5dff55b17b36d
//      /src/main/generic/consensus/base/account/Address.js#L139
export function ibanCheck(str: string): number {
    const num = str.split('').map((c) => {
        const code = c.toUpperCase().charCodeAt(0);
        return code >= 48 && code <= 57 ? c : (code - 55).toString();
    }).join('');
    let tmp = '';

    for (let i = 0; i < Math.ceil(num.length / 6); i++) {
        tmp = (Number.parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString();
    }

    return Number.parseInt(tmp, 10);
}

// from https://github.com/nimiq/core-js/blob/23d4ef127dafef00ba2c48d6c4c54ae9a59ffc35
//      /src/main/generic/utils/buffer/BufferUtils.js#L143
const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVXY';
export function toBase32(buffer: Uint8Array): string {
    let shift = 3;
    let carry = 0;
    let byte;
    let symbol;
    let i;
    let res = '';
    const buf = new Uint8Array(buffer);

    for (i = 0; i < buf.length; i++) {
        byte = buf[i];
        symbol = carry | (byte >> shift);
        res += alphabet[symbol & 0x1F];

        if (shift > 5) {
            shift -= 5;
            symbol = byte >> shift;
            res += alphabet[symbol & 0x1F];
        }

        shift = 5 - shift;
        carry = byte << shift;
        shift = 8 - shift;
    }

    if (shift !== 3) {
        res += alphabet[carry & 0x1F];
    }

    while (res.length % 8 !== 0 && alphabet.length === 33) {
        res += alphabet[32];
    }

    return res;
}

// from https://github.com/nimiq/core-js/blob/3e6cb39625a278dcd9f4406b9ed5dff55b17b36d
//      /src/main/generic/consensus/base/account/Address.js#L166
export const CCODE = 'NQ';
