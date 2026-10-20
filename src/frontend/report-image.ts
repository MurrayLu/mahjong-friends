import type { ReportPresentation } from "./reports";

export const REPORT_CARD_SIZES = {
  "3:4": { width: 900, height: 1200 },
} as const;
export const REPORT_ILLUSTRATION_URL = "/brand/illustration.svg";

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

const amount = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString("zh-TW")}`;
const amountColor = (value: number) =>
  value > 0 ? "#93c5ac" : value < 0 ? "#e6a091" : "#b6b2ad";

/** Fit real text to at most two lines, including unbroken nicknames/mottos. */
export function reportTextLines(
  value: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const character of value.replace(/\s+/g, " ")) {
    if (line && measure(line + character) > maxWidth) {
      lines.push(line);
      line = "";
      if (lines.length === 2) {
        let last = lines[1];
        while (last && measure(last + "…") > maxWidth) last = last.slice(0, -1);
        lines[1] = last + "…";
        return lines;
      }
    }
    line += character;
  }
  if (line) lines.push(line);
  return lines;
}

/** Standalone portrait snapshot. Only the privacy-filtered presentation reaches this renderer. */
export async function createReportImage(
  p: ReportPresentation,
  ratio: keyof typeof REPORT_CARD_SIZES = "3:4",
): Promise<Blob> {
  const { width, height } = REPORT_CARD_SIZES[ratio];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("CanvasUnavailable");
  await document.fonts.ready;
  const illustration = await loadImage(REPORT_ILLUSTRATION_URL);
  c.fillStyle = "#111416";
  c.fillRect(0, 0, width, height);
  c.strokeStyle = "#45494b";
  c.lineWidth = 1;
  c.strokeRect(24, 24, width - 48, height - 48);
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#f4f0e9",
    maxWidth = width - 120,
    align: CanvasTextAlign = "center",
    weight = 600,
  ) => {
    c.font = `${weight} ${size}px "Microsoft JhengHei", sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(value, x, y, maxWidth);
  };
  // Compact, off-axis masthead: the report identity, not the logo, is the title.
  c.drawImage(illustration, 54, 48, 112, 84);
  text("這桌", 181, 85, 26, "#d3af69", 200, "left");
  text("MAHJONG / FRIENDS", 181, 114, 14, "#96938e", 300, "left");
  text(p.subtitle, 834, 91, 19, "#b6b2ad", 285, "right", 400);
  text(p.title, 66, 194, 36, "#f4f0e9", 430, "left");
  text(p.room, 66, 234, 24, "#b6b2ad", 765, "left", 400);
  c.strokeStyle = "#343a3e";
  c.beginPath();
  c.moveTo(66, 265);
  c.lineTo(834, 265);
  c.stroke();

  text(p.heroLabel, width / 2, 315, 22, "#d3af69");
  const columns = Math.min(
    3,
    Math.max(1, Math.ceil(Math.sqrt(p.leaders.length))),
  );
  const rows = Math.max(1, Math.ceil(p.leaders.length / columns));
  const cellWidth = 768 / columns;
  const cellHeight = 390 / rows;
  const scale = Math.min(1, cellHeight / 360, cellWidth / 360);
  const winners = await Promise.all(
    p.leaders.map(async (leader) => {
      let img: HTMLImageElement | null = null;
      if (
        leader.AvatarImageUrl &&
        /^\/(images\/|api\/media\/)/.test(leader.AvatarImageUrl)
      ) {
        try {
          img = await loadImage(leader.AvatarImageUrl);
        } catch {
          /* Avatar initials fallback. */
        }
      }
      return { leader, img };
    }),
  );
  winners.forEach(({ leader, img }, i) => {
    const row = Math.floor(i / columns);
    const rowCount = Math.min(columns, winners.length - row * columns);
    const x = width / 2 + ((i % columns) - (rowCount - 1) / 2) * cellWidth;
    const top = 344 + row * cellHeight;
    const radius = 47 * scale;
    const avatarY = top + radius;
    c.save();
    c.beginPath();
    c.arc(x, avatarY, radius, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#252b2f";
    c.fillRect(x - radius, avatarY - radius, radius * 2, radius * 2);
    if (img) {
      const crop = Math.min(img.width, img.height);
      c.drawImage(
        img,
        (img.width - crop) / 2,
        (img.height - crop) / 2,
        crop,
        crop,
        x - radius,
        avatarY - radius,
        radius * 2,
        radius * 2,
      );
    } else
      text(leader.DisplayName.slice(0, 1), x, avatarY + 13 * scale, 36 * scale);
    c.restore();
    text(
      leader.DisplayName,
      x,
      top + 151 * scale,
      44 * scale,
      "#f4f0e9",
      cellWidth - 32,
    );
    text(
      amount(leader.NetAmount),
      x,
      top + 235 * scale,
      76 * scale,
      amountColor(leader.NetAmount),
      cellWidth - 32,
      "center",
      700,
    );
    c.font = `500 ${27 * scale}px "Microsoft JhengHei", sans-serif`;
    const quote = reportTextLines(
      `「${p.leaderQuotes[leader.PlayerId]}」`,
      cellWidth - 48,
      (value) => c.measureText(value).width,
    );
    quote.forEach((line, j) =>
      text(
        line,
        x,
        top + (291 + j * 36) * scale,
        27 * scale,
        "#ddc393",
        cellWidth - 48,
        "center",
        500,
      ),
    );
  });
  text(`${p.hands} 將`, width / 2, 754, 21, "#b6b2ad", 600, "center", 400);
  if (p.tags.length) text(p.tags.join("  ·  "), width / 2, 785, 16, "#b6b2ad");

  // A bounded results panel; names and amounts share each row rather than separate corners.
  c.fillStyle = "#1a1f22";
  c.fillRect(60, 817, 780, 317);
  c.strokeStyle = "#343a3e";
  c.strokeRect(60, 817, 780, 317);
  if (p.privacyLine) {
    text(p.privacyLine, width / 2, 983, 28, "#d3af69");
  } else {
    text("完整戰績", 90, 860, 20, "#d3af69", 400, "left");
    const listColumns = Math.max(1, Math.ceil(p.rankings.length / 8));
    const listWidth = 720 / listColumns;
    const rowHeight = Math.min(
      42,
      240 / Math.min(8, Math.max(1, p.rankings.length)),
    );
    p.rankings.forEach((r, i) => {
      const x = 90 + Math.floor(i / 8) * listWidth;
      const y = 906 + (i % 8) * rowHeight;
      const size = listColumns > 1 ? 17 : 23;
      text(`${i + 1}`, x, y, size - 3, "#96938e", 30, "left", 400);
      text(
        r.DisplayName,
        x + 40,
        y,
        size,
        "#f4f0e9",
        listWidth * 0.64 - 48,
        "left",
        400,
      );
      text(
        amount(r.NetAmount),
        x + listWidth - 4,
        y,
        size,
        amountColor(r.NetAmount),
        listWidth * 0.32,
        "right",
      );
    });
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("ImageExportFailed"))),
      "image/png",
    ),
  );
}
