// Sprint 10 Story 2 - the security code two people compare to confirm their
// conversation is end-to-end encrypted.
//
// The backend (`GET /api/privacy/security-code/:userId`) hashes both public
// keys and returns 24 hex characters grouped with dashes, e.g.
// "A1B2-C3D4-E5F6-0718-2939-4A5B". The design shows a 36-digit decimal block,
// so the hex is read as one big integer and re-rendered in base 10.
//
// That transform has to match the web client's `formatSecurityCodeForDisplay`
// exactly: a security code is only useful if the two people comparing it - one
// on the phone, one in the browser - read the same digits off their screens.
// The conversion is done with plain digit arithmetic rather than `BigInt` so it
// cannot depend on the JavaScript engine the app happens to be running on.

/** Digits per group, and groups per row, as the design lays the block out. */
export const SECURITY_CODE_GROUP_SIZE = 4;
export const SECURITY_CODE_GROUPS_PER_ROW = 3;
export const SECURITY_CODE_LENGTH = 36;

/** Base-16 string to base-10 string, with no leading zeros. */
function hexToDecimal(hex: string): string {
  // `digits` holds the running decimal value least-significant first, so each
  // new hex character is a multiply-by-16-and-add over the whole array.
  const digits: number[] = [0];

  for (const character of hex) {
    let carry = parseInt(character, 16);
    if (Number.isNaN(carry)) { continue; }
    for (let index = 0; index < digits.length; index += 1) {
      const total = digits[index] * 16 + carry;
      digits[index] = total % 10;
      carry = Math.floor(total / 10);
    }
    while (carry > 0) {
      digits.push(carry % 10);
      carry = Math.floor(carry / 10);
    }
  }

  return digits.reverse().join('').replace(/^0+(?=\d)/, '');
}

/**
 * The 36 digits to display, or '' when the server sent nothing usable.
 * Dashes and any other separator the server adds are ignored.
 */
export function formatSecurityCode(value: unknown): string {
  const compact = String(value ?? '').replace(/[^a-fA-F0-9]/g, '');
  if (!compact) { return ''; }

  // A server that already answers in digits is passed straight through.
  if (new RegExp(`^\\d{${SECURITY_CODE_LENGTH}}$`).test(compact)) { return compact; }

  return hexToDecimal(compact).padStart(SECURITY_CODE_LENGTH, '0').slice(-SECURITY_CODE_LENGTH);
}

/**
 * Split the code into rows of groups for the tile grid:
 * `[['9153','6254','4528'], ...]`. A partial trailing group is kept rather
 * than padded, so an unexpected length still renders every digit.
 */
export function securityCodeRows(code: string): string[][] {
  const groups = (String(code || '').match(new RegExp(`.{1,${SECURITY_CODE_GROUP_SIZE}}`, 'g')) || []);
  const rows: string[][] = [];
  for (let index = 0; index < groups.length; index += SECURITY_CODE_GROUPS_PER_ROW) {
    rows.push(groups.slice(index, index + SECURITY_CODE_GROUPS_PER_ROW));
  }
  return rows;
}

/** The grouped form that gets copied and shared: "9153 6254 4528 …". */
export function securityCodeForClipboard(code: string): string {
  return (String(code || '').match(new RegExp(`.{1,${SECURITY_CODE_GROUP_SIZE}}`, 'g')) || []).join(' ');
}

/**
 * "Today, 10:24 AM" for a code generated in this session. The code is derived
 * from keys rather than stored with a timestamp, so the only honest thing to
 * show is when this device last computed it.
 */
export function formatSecurityCodeUpdatedAt(value: Date | string | number): string {
  const updatedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(updatedAt.getTime())) { return ''; }

  const time = updatedAt.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (updatedAt.getTime() >= startOfToday.getTime()) { return `Today, ${time}`; }

  return `${updatedAt.toLocaleDateString([], {month: 'short', day: 'numeric'})}, ${time}`;
}
