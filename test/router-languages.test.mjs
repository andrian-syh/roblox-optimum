/**
 * The prompt router across sixteen languages. A route word the router does not know may leave a
 * request unrouted, which lists every skill, but it must never route to the wrong skill.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { routePrompt } from "../scripts/lib/router.mjs";

/**
 * Per language: a repository chore, a symptom, a request to write code, a quoted engine error,
 * and a request with no Roblox in it. Game requests name a Roblox API, the same in any language.
 */
const LANGUAGES = {
  English: {
    chore: "update the CHANGELOG and bump package.json to v2.0.0",
    symptom: "my leaderstats reset every time a player rejoins",
    write: "write a RemoteEvent handler for the shop",
    error: `i keep getting "attempt to index nil with 'Character'" in the output`,
    other: "what is a good recipe for pancakes",
  },
  Indonesian: {
    chore: "perbarui CHANGELOG dan naikkan package.json ke v2.0.0",
    symptom: "leaderstats saya reset setiap kali pemain rejoin",
    write: "buatkan handler RemoteEvent untuk toko",
    error: `muncul error "attempt to index nil with 'Character'" di output`,
    other: "apa resep pancake yang enak",
  },
  Malay: {
    chore: "kemas kini CHANGELOG dan naikkan package.json kepada v2.0.0",
    symptom: "leaderstats saya reset setiap kali pemain masuk semula",
    write: "tulis pengendali RemoteEvent untuk kedai",
    error: `keluar ralat "attempt to index nil with 'Character'" dalam output`,
    other: "apakah resipi lempeng yang sedap",
  },
  Japanese: {
    chore: "CHANGELOG を更新して package.json を v2.0.0 に上げて",
    symptom: "プレイヤーが再参加するたびに leaderstats がリセットされる",
    write: "ショップ用の RemoteEvent ハンドラーを書いて",
    error: `出力に "Infinite yield possible on 'ReplicatedStorage:WaitForChild("Remotes")'" と出る`,
    other: "美味しいパンケーキのレシピを教えて",
  },
  Portuguese: {
    chore: "atualize o CHANGELOG e suba o package.json para v2.0.0",
    symptom: "meu leaderstats reseta toda vez que o jogador volta",
    write: "escreva um handler de RemoteEvent para a loja",
    error: `aparece "attempt to call a nil value" no output`,
    other: "qual é uma boa receita de panqueca",
  },
  Spanish: {
    chore: "actualiza el CHANGELOG y sube package.json a v2.0.0",
    symptom: "mis leaderstats se reinician cada vez que el jugador vuelve a entrar",
    write: "escribe un manejador de RemoteEvent para la tienda",
    error: `me sale "Infinite yield possible on 'Players.Player1:WaitForChild("Data")'" en la consola`,
    other: "cuál es una buena receta de panqueques",
  },
  Hindi: {
    chore: "CHANGELOG अपडेट करो और package.json को v2.0.0 पर ले जाओ",
    symptom: "हर बार खिलाड़ी के दोबारा जुड़ने पर मेरे leaderstats रीसेट हो जाते हैं",
    write: "दुकान के लिए RemoteEvent हैंडलर लिखो",
    error: `आउटपुट में "attempt to index nil with 'Humanoid'" आ रहा है`,
    other: "पैनकेक की अच्छी रेसिपी क्या है",
  },
  Arabic: {
    chore: "حدّث ملف CHANGELOG وارفع package.json إلى v2.0.0",
    symptom: "يتم تصفير leaderstats كلما عاد اللاعب إلى اللعبة",
    write: "اكتب معالج RemoteEvent للمتجر",
    error: `تظهر رسالة "is not a valid member of Workspace" في المخرجات`,
    other: "ما هي وصفة جيدة للفطائر",
  },
  Chinese: {
    chore: "更新 CHANGELOG 并把 package.json 升到 v2.0.0",
    symptom: "每次玩家重新加入，我的 leaderstats 都会被重置",
    write: "为商店写一个 RemoteEvent 处理器",
    error: `输出里一直出现 "attempt to perform arithmetic (add) on nil and number"`,
    other: "有什么好吃的煎饼食谱",
  },
  Russian: {
    chore: "обнови CHANGELOG и подними package.json до v2.0.0",
    symptom: "мои leaderstats сбрасываются каждый раз, когда игрок перезаходит",
    write: "напиши обработчик RemoteEvent для магазина",
    error: `в выводе ошибка "Script timeout: exhausted allowed execution time"`,
    other: "какой хороший рецепт блинов",
  },
  Korean: {
    chore: "CHANGELOG를 업데이트하고 package.json을 v2.0.0으로 올려줘",
    symptom: "플레이어가 다시 들어올 때마다 leaderstats가 초기화돼",
    write: "상점용 RemoteEvent 핸들러를 작성해줘",
    error: `출력에 "Unable to cast value to Object" 오류가 나와`,
    other: "맛있는 팬케이크 레시피 알려줘",
  },
  Turkish: {
    chore: "CHANGELOG dosyasını güncelle ve package.json'ı v2.0.0 yap",
    symptom: "oyuncu her yeniden girdiğinde leaderstats sıfırlanıyor",
    write: "mağaza için bir RemoteEvent işleyicisi yaz",
    error: `çıktıda "Requested module experienced an error while loading" hatası var`,
    other: "iyi bir krep tarifi nedir",
  },
  French: {
    chore: "mets à jour le CHANGELOG et passe package.json en v2.0.0",
    symptom: "mes leaderstats se réinitialisent à chaque fois qu'un joueur revient",
    write: "écris un gestionnaire RemoteEvent pour la boutique",
    error: `j'ai "DataStore request was added to queue" dans la sortie`,
    other: "quelle est une bonne recette de crêpes",
  },
  Italian: {
    chore: "aggiorna il CHANGELOG e porta package.json a v2.0.0",
    symptom: "le mie leaderstats si azzerano ogni volta che un giocatore rientra",
    write: "scrivi un gestore RemoteEvent per il negozio",
    error: `nell'output compare "attempt to compare number < nil"`,
    other: "qual è una buona ricetta per i pancake",
  },
  German: {
    chore: "aktualisiere das CHANGELOG und setze package.json auf v2.0.0",
    symptom: "meine leaderstats werden jedes Mal zurückgesetzt, wenn ein Spieler wieder beitritt",
    write: "schreib einen RemoteEvent-Handler für den Shop",
    error: `in der Ausgabe steht "Maximum event re-entrancy depth exceeded"`,
    other: "was ist ein gutes Rezept für Pfannkuchen",
  },
  Dutch: {
    chore: "werk de CHANGELOG bij en zet package.json op v2.0.0",
    symptom: "mijn leaderstats worden gereset elke keer dat een speler opnieuw joint",
    write: "schrijf een RemoteEvent-handler voor de winkel",
    error: `in de output staat "Remote event invocation queue exhausted"`,
    other: "wat is een goed recept voor pannenkoeken",
  },
};

/** Whether a route is acceptable for a game request: the expected skill, or none forced. */
const fair = (route, skill) => route !== null && (route.skill === skill || route.skill === null);

for (const [language, prompts] of Object.entries(LANGUAGES)) {
  test(`${language}: a repository chore has no skill forced on it`, () => {
    assert.equal(routePrompt(prompts.chore, true)?.skill ?? null, null, prompts.chore);
  });

  test(`${language}: a symptom reaches diagnose or no skill, never another`, () => {
    assert.ok(fair(routePrompt(prompts.symptom, true), "diagnose"), prompts.symptom);
  });

  test(`${language}: a request to write code reaches best-practices or no skill, never another`, () => {
    assert.ok(fair(routePrompt(prompts.write, true), "best-practices"), prompts.write);
  });

  test(`${language}: a quoted engine error reaches diagnose`, () => {
    assert.equal(routePrompt(prompts.error, true)?.skill, "diagnose", prompts.error);
  });

  test(`${language}: outside a project, a request naming a Roblox API is still Roblox work`, () => {
    assert.notEqual(routePrompt(prompts.write, false), null, prompts.write);
  });

  test(`${language}: outside a project, a request with no Roblox in it is left alone`, () => {
    assert.equal(routePrompt(prompts.other, false), null, prompts.other);
  });
}
