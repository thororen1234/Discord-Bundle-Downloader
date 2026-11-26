import { bufferResponse } from "@/lib/http";
import { getIntlKeys } from "@/lib/intlKeys";

export async function GET() {
    return bufferResponse(Buffer.from(JSON.stringify(await getIntlKeys())), "application/json");
}
