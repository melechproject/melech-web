window.extractDominantColor = function (imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = function () {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 10;
        canvas.height = 10;

        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;

        let r = 0,
          g = 0,
          b = 0;
        const count = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        r = Math.min(255, r + 20);
        g = Math.min(255, g + 20);
        b = Math.min(255, b + 20);

        resolve(`rgba(${r}, ${g}, ${b}, 0.25)`);
      } catch (err) {
        resolve("rgba(255, 255, 255, 0.1)");
      }
    };

    img.onerror = function () {
      resolve("rgba(255, 255, 255, 0.1)");
    };
  });
};
