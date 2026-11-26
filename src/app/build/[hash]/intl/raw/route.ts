import { bufferResponse } from "@/lib/http";
import { findIntlMessage } from "@/lib/intl";

export async function GET(request: Request, { params }: RouteContext<"/build/[hash]/intl/raw">) {
    const message = await findIntlMessage(request, (await params).hash);
    if (message instanceof Response) return message;
    return bufferResponse(Buffer.from(JSON.stringify(message.value)), "application/json");
}
