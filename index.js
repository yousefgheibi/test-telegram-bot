import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import { createCanvas, registerFont } from "canvas";
import { Parser } from "json2csv";
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
    users.push({ chatId, name, date: new Date().toLocaleString("fa-IR") });
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
        ["📈 خلاصه وضعیت", "📤 خروجی CSV"],
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
      startTransaction(chatId, "buy");
      break;
    case "🔴 ثبت فروش":
      startTransaction(chatId, "sell");
      break;
    case "📈 خلاصه وضعیت":
      showSummary(chatId);
      break;
    case "📤 خروجی CSV":
      exportCSV(chatId);
      break;
    default:
      sendMainMenu(chatId);
  }
});

function startTransaction(chatId, type) {
  userState[chatId] = { type, step: "name" };
  const label = type === "buy" ? "خریدار" : "فروشنده";
  bot.sendMessage(chatId, `👤 لطفاً نام ${label} را وارد کنید:`);
}

function handleInput(chatId, text) {
  const state = userState[chatId];

  switch (state.step) {
    case "name":
      state.name = text;
      state.step = "priceMithqal";
      bot.sendMessage(
        chatId,
        "💰 لطفاً قیمت روز مثقال طلا (به تومان) را وارد کنید:"
      );
      break;

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
      state.weight = parseFloat(
        ((state.amount / state.priceMithqal) * 4.3318).toFixed(3)
      );
      state.step = "desc";
      bot.sendMessage(chatId, "📝 توضیحات (اختیاری) را وارد کنید:");
      break;

    case "desc":
      state.desc = text || "-";
      saveTransaction(chatId, {
        type: state.type,
        name: state.name,
        priceMithqal: state.priceMithqal,
        amount: state.amount,
        weight: state.weight,
        desc: state.desc,
      });
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
    date: new Date().toLocaleString("fa-IR"),
  };
  transactions.push(entry);
  fs.writeFileSync(userFile, JSON.stringify(transactions, null, 2));

  const filePath = `${exportDir}/invoice_${chatId}_${Date.now()}.png`;
  createInvoiceImage(entry, filePath, () => {
    bot.sendPhoto(chatId, filePath, {
      caption: `✅ تراکنش ${entry.type === "buy" ? "خرید" : "فروش"} ثبت شد.`,
    });
  });
}

function createInvoiceImage(entry, outputPath, callback) {
  const width = 600;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fef6e4";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 32px Vazirmatn";
  ctx.fillText("فاکتور طلا", 200, 50);
  ctx.textAlign = "right";

  const startX = width - 40;
  let startY = 110;
  const lineHeight = 40;

  ctx.fillStyle = "#333";
  ctx.font = "20px Vazirmatn";
  ctx.fillText(`تاریخ: ${entry.date}`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`نوع تراکنش: ${entry.type === "buy" ? "خرید" : "فروش"}`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`نام: ${entry.name}`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`قیمت مثقال: ${entry.priceMithqal.toLocaleString("fa-IR")} تومان`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`مبلغ کل: ${entry.amount.toLocaleString("fa-IR")} تومان`, startX, startY);
  startY += lineHeight;
  ctx.fillText(`وزن تقریبی: ${entry.weight.toFixed(3)} گرم`, startX, startY);
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
  const profit = totalSell - totalBuy;

  const msg = `
📊 خلاصه وضعیت:
-------------------------
🟢 مجموع خرید: ${totalBuy.toLocaleString("fa-IR")} تومان
🔴 مجموع فروش: ${totalSell.toLocaleString("fa-IR")} تومان
💎 سود / زیان خالص: ${profit.toLocaleString("fa-IR")} تومان
-------------------------
📅 تعداد تراکنش‌ها: ${transactions.length}
`;
  bot.sendMessage(chatId, msg);
}

function exportCSV(chatId) {
  const userFile = `${dataDir}/data_${chatId}.json`;
  if (!fs.existsSync(userFile))
    return bot.sendMessage(chatId, "❗ هنوز تراکنشی ثبت نکرده‌اید.");

  const transactions = JSON.parse(fs.readFileSync(userFile));
  if (!transactions.length)
    return bot.sendMessage(chatId, "❗ داده‌ای برای خروجی وجود ندارد.");

  const csv = new Parser({
    fields: [
      "type",
      "name",
      "priceMithqal",
      "amount",
      "weight",
      "desc",
      "date",
    ],
  }).parse(
    transactions.map((t) => ({
      ...t,
      name: t.name,
      priceMithqal: `${t.priceMithqal.toLocaleString("fa-IR")} تومان`,
      amount: `${t.amount.toLocaleString("fa-IR")} تومان`,
      weight: `${t.weight.toFixed(3)} گرم`,
      desc: t.desc,
      date: t.date,
    }))
  );

  const filePath = `${exportDir}/transactions_${chatId}_${Date.now()}.csv`;
  fs.writeFileSync(filePath, csv, "utf8");

  bot.sendDocument(chatId, filePath, {
    caption: "📄 فایل CSV تراکنش‌ها",
  });
}
