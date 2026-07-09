// สร้างท่อน TLV หนึ่งท่อน เช่น tlv("00", "01") → "000201"
function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return tag + len + value;
}

// CRC-16/CCITT-FALSE — โครงสร้างเหมือน bit manipulation ใน C++ เลย
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff; // JS ไม่มี uint16 ต้อง mask เอง!
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function generatePromptPayPayload(
  roomId: string,
  phone: string,
  amount: number,
): string {
  // "0812345678" → "0066812345678"
  const formattedPhone = "0066" + phone.replace(/^0/, "");

  // Tag 29 ข้างในเป็น TLV ซ้อนอีกชั้น
  const merchantInfo = tlv(
    "29",
    tlv("00", "A000000677010111") + // AID ของ PromptPay (ค่าคงที่)
      tlv("01", formattedPhone),
  );

  const payload =
    tlv("00", "01") + // payload format
    tlv("01", "12") + // dynamic QR (มียอดเงิน)
    merchantInfo +
    tlv("53", "764") + // THB
    tlv("54", amount.toFixed(2)) + // "100.50"
    tlv("58", "TH") +
    "6304"; // tag CRC + length ต่อท้ายก่อนคำนวณ

  return payload + crc16(payload);
}
