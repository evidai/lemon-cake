import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const SPREADSHEET_ID  = process.env.GOOGLE_SHEETS_CONTACT_ID;
const SHEET_NAME      = process.env.GOOGLE_SHEETS_CONTACT_SHEET ?? "お問い合わせ";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function POST(req: NextRequest) {
  try {
    const { name, company, title, email, type, message } = await req.json();

    if (!name || !company || !title || !email || !message) {
      return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
    }

    if (!SPREADSHEET_ID) {
      return NextResponse.json({ error: "スプレッドシートが未設定です" }, { status: 500 });
    }

    const typeLabel: Record<string, string> = {
      intro:       "導入・採用相談",
      tech:        "技術・API相談",
      partnership: "パートナーシップ",
      demo:        "デモのリクエスト",
      other:       "その他",
    };

    const auth    = getAuth();
    const sheets  = google.sheets({ version: "v4", auth });
    const now     = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range:         `${SHEET_NAME}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          now,                        // A: 受信日時
          name,                       // B: お名前
          company,                    // C: 会社名
          title,                      // D: 役職
          email,                      // E: メール
          typeLabel[type] ?? type,    // F: 種別
          message,                    // G: メッセージ
          "未対応",                    // H: 対応ステータス
        ]],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact]", err);
    return NextResponse.json(
      { error: "送信に失敗しました。しばらくしてから再度お試しください。" },
      { status: 500 },
    );
  }
}
