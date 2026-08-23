// Genera una imagen de portada (1200x630, tamano estandar de Open Graph)
// para cada articulo del blog, con el diseno de marca de Esteban IA -- en
// vez de usar la misma foto generica para todos los articulos, o una
// imagen de IA generica que se veria barata.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "..", "assets", "fonts");

let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const [bold, regular] = await Promise.all([
    readFile(path.join(FONTS_DIR, "Poppins-Bold.ttf")),
    readFile(path.join(FONTS_DIR, "Poppins-Regular.ttf"))
  ]);
  fontCache = [
    { name: "Poppins", data: bold, weight: 700, style: "normal" },
    { name: "Poppins", data: regular, weight: 400, style: "normal" }
  ];
  return fontCache;
}

const WIDTH = 1200;
const HEIGHT = 630;
const GOLD_GRADIENT = "linear-gradient(135deg, #f3e5ab 0%, #d4af37 50%, #aa7c11 100%)";

export async function generateCoverImagePng(title) {
  const fonts = await loadFonts();

  const markup = {
    type: "div",
    props: {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#040405",
        backgroundImage: "radial-gradient(circle at 85% 20%, rgba(212,175,55,0.18) 0%, rgba(4,4,5,0) 55%)",
        padding: "70px",
        fontFamily: "Poppins"
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "14px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    width: "56px",
                    height: "56px",
                    borderRadius: "14px",
                    backgroundImage: GOLD_GRADIENT,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "26px",
                    fontWeight: 700,
                    color: "#0a0a0a"
                  },
                  children: "ES"
                }
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", flexDirection: "column" },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "24px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "1px" },
                        children: "ESTEBAN SERNA"
                      }
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "16px", color: "#d4af37" },
                        children: "IA para Negocios"
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              fontSize: title.length > 55 ? "52px" : "62px",
              fontWeight: 700,
              lineHeight: 1.25,
              color: "#f0f0f5",
              maxWidth: "1000px"
            },
            children: title
          }
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              fontSize: "20px",
              color: "#9090a0",
              letterSpacing: "2px",
              textTransform: "uppercase"
            },
            children: "BLOG · AGENTES DE IA Y AUTOMATIZACIÓN EMPRESARIAL"
          }
        }
      ]
    }
  };

  const svg = await satori(markup, { width: WIDTH, height: HEIGHT, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  const pngBuffer = resvg.render().asPng();
  return pngBuffer;
}
