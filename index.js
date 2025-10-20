import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import XLSX from "xlsx";
import { createCanvas, registerFont } from "canvas";
import dotenv from "dotenv";
dotenv.config({ debug: false });

registerFont("./assets/font/vazirmatn.ttf", { family: "Vazirmatn" });
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const dataDir = "./data";
const exportDir = "./exports";
const usersFile = "./users.json";

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, "[]", "utf8");

const ADMIN_CHAT_ID = 507528648;
const userState = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "کاربر";
  registerUser(chatId, name);
  sendMainMenu(chatId);
});

function registerUser(chatId, name) {
  const users = JSON.parse(fs.readFileSync(usersFile));
  if (!users.find((u) => u.chatId === chatId)) {
    users.push({
      chatId,
      name,
      date: new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }),
    });
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    bot.sendMessage(
      ADMIN_CHAT_ID,
      `📢 کاربر جدید ثبت شد:\n👤 ${name}\n🆔 ${chatId}`
    );
  }
}

function sendMainMenu(chatId) {
  bot.sendMessage(chatId, "📊 لطفاً یکی از گزینه‌ها را انتخاب کنید:", {
    reply_markup: {
      keyboard: [
        ["🟢 ثبت خرید", "🔴 ثبت فروش"],
        ["📈 خلاصه وضعیت", "📤 خروجی فایل"],
      ],
      resize_keyboard: true,
    },
  });
}

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (text === "/start") return;

  if (userState[chatId]?.step) {
    handleInput(chatId, text);
    return;
  }

  switch (text) {
    case "🟢 ثبت خرید":
      userState[chatId] = { type: "buy", step: "name" };
      bot.sendMessage(chatId, "👤 لطفاً نام خریدار را وارد کنید:");
      break;
    case "🔴 ثبت فروش":
      userState[chatId] = { type: "sell", step: "name" };
      bot.sendMessage(chatId, "👤 لطفاً نام فروشنده را وارد کنید:");
      break;
    case "📈 خلاصه وضعیت":
      showSummary(chatId);
      break;
    case "📤 خروجی فایل":
      exportExcel(chatId);
      break;
    default:
      sendMainMenu(chatId);
  }
});

function handleInput(chatId, text) {
  const state = userState[chatId];

  switch (state.step) {
    // --- گرفتن نام خریدار/فروشنده ---
    case "name":
      state.name = text;
      state.step = "itemType";
      bot.sendMessage(chatId, "🏷 لطفاً نوع کالا را انتخاب کنید:", {
        reply_markup: {
          keyboard: [["طلا", "سکه", "ارز"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      break;

    // --- انتخاب نوع کالا ---
    case "itemType":
      if (!["طلا", "سکه", "ارز"].includes(text))
        return bot.sendMessage(chatId, "❌ لطفاً یکی از گزینه‌ها را انتخاب کنید.");

      state.itemType = text;

      if (text === "طلا") {
        state.step = "priceMithqal";
        bot.sendMessage(
          chatId,
          "💰 لطفاً قیمت روز مثقال طلا (به تومان) را وارد کنید:"
        );
      } else if (text === "سکه") {
        state.step = "coinType";
        bot.sendMessage(chatId, "🪙 لطفاً نوع سکه را انتخاب کنید:", {
          reply_markup: {
            keyboard: [["ربع", "نیم", "تمام"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      } else if (text === "ارز") {
        state.step = "currencyType";
        bot.sendMessage(chatId, "💵 لطفاً نوع ارز را انتخاب کنید:", {
          reply_markup: {
            keyboard: [["دلار", "یورو", "لیر"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
      break;

    // --- طلا ---
    case "priceMithqal":
      if (isNaN(text))
        return bot.sendMessage(chatId, "❌ لطفاً فقط عدد وارد کنید.");
      state.priceMithqal = Number(text);
      state.step = "amount";
      bot.sendMessage(
        chatId,
        "💵 مبلغ کل خرید یا فروش (به تومان) را وارد کنید:"
      );
      break;

    case "amount":
      if (isNaN(text))
        return bot.sendMessage(chatId, "❌ لطفاً فقط عدد وارد کنید.");
      state.amount = Number(text);

      if (state.itemType === "طلا") {
        state.weight = parseFloat(
          ((state.amount / state.priceMithqal) * 4.3318).toFixed(3)
        );
        state.step = "desc";
        bot.sendMessage(chatId, "📝 توضیحات (اختیاری) را وارد کنید:");
      } else {
        state.step = "quantity";
        bot.sendMessage(chatId, "🔢 لطفاً تعداد را وارد کنید:");
      }
      break;

    // --- سکه و ارز ---
    case "coinType":
      state.coinType = text;
      state.step = "basePrice";
      bot.sendMessage(chatId, "💰 لطفاً قیمت پایه سکه (به تومان) را وارد کنید:");
      break;

    case "currencyType":
      state.currencyType = text;
      state.step = "basePrice";
      bot.sendMessage(chatId, "💰 لطفاً قیمت پایه ارز (به تومان) را وارد کنید:");
      break;

    case "basePrice":
      if (isNaN(text))
        return bot.sendMessage(chatId, "❌ لطفاً فقط عدد وارد کنید.");
      state.basePrice = Number(text);
      state.step = "quantity";
      bot.sendMessage(chatId, "🔢 لطفاً تعداد را وارد کنید:");
      break;

    case "quantity":
      if (isNaN(text))
        return bot.sendMessage(chatId, "❌ لطفاً فقط عدد وارد کنید.");
      state.quantity = Number(text);
      state.amount = state.basePrice * state.quantity;
      state.step = "desc";
      bot.sendMessage(chatId, "📝 توضیحات (اختیاری) را وارد کنید:");
      break;

    // --- توضیحات و ذخیره ---
    case "desc":
      state.desc = text || "-";
      saveTransaction(chatId, state);
      delete userState[chatId];
      break;
  }
}

function saveTransaction(chatId, record) {
  const userFile = `${dataDir}/data_${chatId}.json`;
  let transactions = [];
  if (fs.existsSync(userFile))
    transactions = JSON.parse(fs.readFileSync(userFile));

  const entry = {
    ...record,
    date: new Date().toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }),
  };
  transactions.push(entry);
  fs.writeFileSync(userFile, JSON.stringify(transactions, null, 2));

  const filePath = `${exportDir}/invoice_${chatId}_${Date.now()}.png`;
  createInvoiceImage(entry, filePath, () => {
    bot.sendPhoto(chatId, filePath, {
      caption: `✅ تراکنش ${entry.type === "buy" ? "خرید" : "فروش"} ثبت شد.`,
    });
  });

  bot.sendMessage(chatId, {
    reply_markup: {
      keyboard: [
        ["🟢 ثبت خرید", "🔴 ثبت فروش"],
        ["📈 خلاصه وضعیت", "📤 خروجی فایل"],
      ],
      resize_keyboard: true,
    },
  });
}

function createInvoiceImage(entry, outputPath, callback) {
  const width = 600;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fffcf8";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 32px Vazirmatn";
  ctx.fillText("گالری یامـــور", 200, 80);
  ctx.textAlign = "right";

  const startX = width - 40;
  let startY = 120;
  const lineHeight = 40;

  ctx.fillStyle = "#333";
  ctx.font = "20px Vazirmatn";
  ctx.fillText(`تاریخ: ${entry.date}`, startX, startY);
  startY += lineHeight;
  ctx.fillText(
    `نوع تراکنش: ${entry.type === "buy" ? "خرید" : "فروش"}`,
    startX,
    startY
  );
  startY += lineHeight;
  ctx.fillText(`نام: ${entry.name}`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`نوع کالا: ${entry.itemType}`, startX, startY);
  startY += lineHeight;

  if (entry.itemType === "طلا") {
    ctx.fillText(
      `قیمت مثقال: ${entry.priceMithqal.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `مبلغ کل: ${entry.amount.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `وزن: ${entry.weight.toLocaleString("fa-IR")} گرم`,
      startX,
      startY
    );
  } else if (entry.itemType === "سکه") {
    ctx.fillText(`نوع سکه: ${entry.coinType}`, startX, startY);
    startY += lineHeight;
    ctx.fillText(
      `قیمت پایه: ${entry.basePrice.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `تعداد: ${entry.quantity.toLocaleString("fa-IR")}`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `مبلغ کل: ${entry.amount.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
  } else if (entry.itemType === "ارز") {
    ctx.fillText(`نوع ارز: ${entry.currencyType}`, startX, startY);
    startY += lineHeight;
    ctx.fillText(
      `قیمت پایه: ${entry.basePrice.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `تعداد: ${entry.quantity.toLocaleString("fa-IR")}`,
      startX,
      startY
    );
    startY += lineHeight;
    ctx.fillText(
      `مبلغ کل: ${entry.amount.toLocaleString("fa-IR")} تومان`,
      startX,
      startY
    );
  }

  startY += lineHeight;
  ctx.fillText(`توضیحات: ${entry.desc}`, startX, startY);

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  callback();
}

function showSummary(chatId) {
  const userFile = `${dataDir}/data_${chatId}.json`;
  if (!fs.existsSync(userFile))
    return bot.sendMessage(chatId, "❗ هنوز تراکنشی ثبت نکرده‌اید.");

  const transactions = JSON.parse(fs.readFileSync(userFile));
  if (!transactions.length)
    return bot.sendMessage(chatId, "❗ داده‌ای برای نمایش وجود ندارد.");

  const totalBuy = transactions
    .filter((t) => t.type === "buy")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSell = transactions
    .filter((t) => t.type === "sell")
    .reduce((sum, t) => sum + t.amount, 0);

  const msg = `
📊 خلاصه وضعیت:
-------------------------
🟢 مجموع خرید: ${totalBuy.toLocaleString("fa-IR")} تومان
🔴 مجموع فروش: ${totalSell.toLocaleString("fa-IR")} تومان
-------------------------
📅 تعداد تراکنش‌ها: ${transactions.length}
`;
  bot.sendMessage(chatId, msg);
}

function exportExcel(chatId) {
  const userFile = `${dataDir}/data_${chatId}.json`;
  if (!fs.existsSync(userFile))
    return bot.sendMessage(chatId, "❗ هنوز تراکنشی ثبت نکرده‌اید.");

  const transactions = JSON.parse(fs.readFileSync(userFile));
  if (!transactions.length)
    return bot.sendMessage(chatId, "❗ داده‌ای برای خروجی وجود ندارد.");

  const formattedData = transactions.map((t) => ({
    "نوع تراکنش": t.type === "buy" ? "خرید" : "فروش",
    "نوع کالا": t.itemType,
    "نام خریدار/فروشنده": t.name,
    جزئیات:
      t.itemType === "طلا"
        ? `نام: ${t.name}`
        : t.itemType === "سکه"
        ? `نام: ${t.name}, نوع سکه: ${t.coinType}`
        : `نام: ${t.name}, نوع ارز: ${t.currencyType}`,
    "قیمت پایه / مثقال": (t.priceMithqal || t.basePrice)?.toLocaleString(
      "fa-IR"
    ),
    "تعداد / مبلغ کل": (t.quantity || t.amount)?.toLocaleString("fa-IR"),
    "مبلغ کل (تومان)": t.amount.toLocaleString("fa-IR"),
    توضیحات: t.desc,
    تاریخ: t.date,
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  const colsWidth = Object.keys(formattedData[0]).map(() => ({ wch: 25 }));
  worksheet["!cols"] = colsWidth;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "تراکنش‌ها");

  const filePath = `${exportDir}/transactions_${chatId}_${Date.now()}.xlsx`;
  XLSX.writeFile(workbook, filePath);
  bot.sendDocument(chatId, filePath);
}
