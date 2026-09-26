var joyWidth = 256;
var joyHeight = 256;
var Z = 3.25;
var joyRender = {
  init(ctx) {
    ctx.lineWidth = 2;
    ctx.font = "18px Arial";
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, ctx.joyWidth, ctx.joyHeight);
  },
  status(ctx, joyX, joyY) {
    ctx.fillStyle = "#888";
    ctx.fillRect(0, 0, ctx.joyWidth, ctx.joyHeight);
    ctx.beginPath();
    ctx.strokeStyle = "#f00";
    ctx.fillStyle = "#e44";
    ctx.arc(joyX, joyY, 30, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.closePath();
  },
  plot(ctx, joyX, joyY) {
    const spot = Math.atan2(joyY - 128, joyX - 128);
    const rad = 105;
    let spotX, spotY;
    if ((joyX - 128) ** 2 + (joyY - 128) ** 2 < rad ** 2) {
      spotX = joyX; spotY = joyY;
    } else {
      spotX = 128 + rad * Math.cos(spot);
      spotY = 128 + rad * Math.sin(spot);
    }
    ctx.beginPath();
    ctx.shadowBlur = 5;
    ctx.shadowColor = "#f88";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f88";
    ctx.arc(128, 128, 30, 0, 2 * Math.PI);
    ctx.moveTo(128 + rad, 128);
    ctx.arc(128, 128, rad, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.moveTo(120 - rad, 128); ctx.lineTo(136 + rad, 128);
    ctx.moveTo(128, 120 - rad); ctx.lineTo(128, 136 + rad);
    ctx.stroke();
    ctx.closePath();
    ctx.beginPath();
    ctx.fillStyle = "#f44";
    ctx.shadowColor = "#f44";
    ctx.arc(spotX, spotY, 20, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fill();
    ctx.closePath();
  },
  crosshair(ctx, z = Z) {
    ctx.beginPath();
    ctx.strokeStyle = "#444";
    ctx.shadowBlur = 0;
    ctx.moveTo(joyWidth / z, 0); ctx.lineTo(joyWidth / z, joyHeight);
    ctx.moveTo(joyWidth / z * (z - 1), 0); ctx.lineTo(joyWidth / z * (z - 1), joyHeight);
    ctx.moveTo(0, joyHeight / z); ctx.lineTo(joyWidth, joyHeight / z);
    ctx.moveTo(0, joyHeight / z * (z - 1)); ctx.lineTo(joyWidth, joyHeight / z * (z - 1));
    ctx.moveTo(0, 0); ctx.lineTo(255, 255);
    ctx.moveTo(255, 0); ctx.lineTo(0, 255);
    ctx.moveTo(110, 0); ctx.lineTo(110, 255);
    ctx.moveTo(146, 0); ctx.lineTo(146, 255);
    ctx.moveTo(0, 110); ctx.lineTo(255, 110);
    ctx.moveTo(0, 146); ctx.lineTo(255, 146);
    ctx.moveTo(178, 128); ctx.arc(128, 128, 50, 0, 2 * Math.PI);
    ctx.moveTo(198, 128); ctx.arc(128, 128, 70, 0, 2 * Math.PI);
    ctx.moveTo(256, 128); ctx.arc(128, 128, 128, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.closePath();
  },
  debug(ctx, X, Y, I, A, B, hex) {
    ctx.beginPath();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff";
    ctx.strokeText(X + "," + Y, 5, 20);
    ctx.strokeText(I, 127, 20);
    ctx.strokeText(A + "," + B, 222, 20);
    ctx.strokeText(innerWidth + "x" + innerHeight, 5, 250);
    ctx.strokeText(hex, 180, 250);
    ctx.stroke();
    ctx.closePath();
  },
  buttons(ctx) {
    ctx.beginPath();
    ctx.fillStyle = "#f44";
    ctx.ellipse(128, 64, 100, 50, 0, 0, 2 * Math.PI);
    ctx.ellipse(128, 192, 100, 50, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.closePath();
  },
  up(ctx) { ctx.fillStyle = "rgba(255,0,0,.25)"; ctx.fillRect(0, 0, ctx.joyWidth, ctx.joyHeight / Z); },
  down(ctx) { ctx.fillStyle = "rgba(0,0,255,.25)"; ctx.fillRect(0, ctx.joyHeight / Z * (Z - 1), ctx.joyWidth, ctx.joyHeight / Z); },
  left(ctx) { ctx.fillStyle = "rgba(0,255,0,.25)"; ctx.fillRect(0, 0, ctx.joyWidth / Z, ctx.joyHeight); },
  right(ctx) { ctx.fillStyle = "rgba(255,0,255,.25)"; ctx.fillRect(ctx.joyWidth / Z * (Z - 1), 0, ctx.joyWidth / Z, ctx.joyHeight); },
  clear(ctx) { ctx.clearRect(-1, -1, ctx.joyWidth + 10, ctx.joyHeight + 10); }
};

window.joyWidth = joyWidth;
window.joyHeight = joyHeight;
window.Z = Z;
window.joyRender = joyRender;
