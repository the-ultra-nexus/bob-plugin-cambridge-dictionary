import * as Bob from "@bob-plug/core";
import { load, Cheerio, AnyNode } from 'cheerio';
import { Part, Phonetic } from './helper/types';

const baseUrl = 'https://dictionary.cambridge.org';
// 每个释义块最多收集的例句数
const MAX_EXAMPLES_PER_DEF = 2;

/**
 *
 * @param {object} query
 * @param {string} query.detectFrom = en; 一定不是 auto
 * @param {string} query.detectTo = "zh-Hans" 一定不是 auto
 * @param {string} query.from = auto 可能是 auto
 * @param {string} query.to = auto 可能是 auto
 * @param {string} query.text = "string"
 * @param {*} completion
 */
function translate(query, completion) {
    if (query.detectFrom !== 'en' || !query.text || query.text.split(" ").length > 3) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    let text = query.text.split(" ").join("-");
    Bob.api.$http.get({
        url: `https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93/${text}`,
        handler: (res) => {
            main(res.data, completion);
            if (res.error) {
                Bob.api.$log.error(`reserr: ${Object.keys(res)}`);
            }
        }
    });
}
const main = (file: any, completion) => {
    const $ = load(file);
    const word = $('.headword').first().text();
    const hasWord = $('.headword').html();
    Bob.api.$log.info(`word: ${word}`);
    if (!hasWord) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    const phonetics: Phonetic[] = [
        makePhonetic($('.us .pron .ipa'), $('.us [type="audio/mpeg"]'), 'us'),
        makePhonetic($('.uk .pron .ipa'), $('.uk [type="audio/mpeg"]'), 'uk')
    ];
    // 词形变化 → Bob exchanges（依据 youdao 插件实证：可点击 dug 正是其 exchanges "过去式: dug"）。
    // words 由 Bob 原生渲染为可点击跳查（用户确认过 dug 可点）。
    // name 用中文标签，避免 "name: words" 渲染时与原文重复（原文一行无法同时可点击，Bob 渲染固定 name: words）
    // 每个 inf-group 一条 exchanges：标签名 + 变形词（可点击跳查）
    // Bob 渲染 "present participle: digging" 每行一条，用户确认此形态（两行可点击）
    const exchanges: Array<{ name: string; words: string[] }> = [];
    // 词形变化（Bob exchanges 整体渲染在卡片顶部；习语/短语动词不放这里 ——
    // 要固定在各自词性下展示，只能走 additions 的 DOM 原位，见 doXref）
    $('.entry-body__el').each((_, el) => {
        $('.irreg-infls .inf-group', el).each((_, g) => {
            const lab = $('.lab', g).text().replace(/\s+/g, ' ').trim();
            const inf = $('.inf', g).text().replace(/\s+/g, ' ').trim();
            if (lab && inf) {
                exchanges.push({ name: lab, words: [inf] });
            }
        });
    });

    // Bob 渲染约束：parts 的 means 会被拼接成单行显示，无法逐行排版。
    // additions 逐条分行 + value 内换行有效（v3 已验证），因此：
    // 每个词性一条 additions（name = 纯词性标签，统一无序号），
    // value 内按释义块组织：{全局序号}. [词组标题] [用法标签] 英文释义 中文释义 + • 例句行。
    // 注意：def-block 可能嵌套在 phrase-block（词组区域）中（如 not 页的 if not / or not），
    // 词组标题取 .phrase-title；中文释义必须是 def-body 的直接子级 .trans
    // （用 children(.trans) 隔离，避免误取例句块的翻译文本）。
    const additions: Array<{ name: string; value: string }> = [];
    const cnGroups: Array<{ name: string; items: string[] }> = [];
    $('.entry-body__el').each((_, el) => {
        // 词性总标题（页面词头+词性）：wet adjective / wet verb [ T ] / not adverb；
        // 短语词条（posgram 空）取 anc-info-head 内的词性（break down phrasal verb）
        const headerWord = $('.di-title .headword', el).first().text().replace(/\s+/g, ' ').trim() || word;
        const posgramText = $('.posgram', el).first().text().replace(/\s+/g, ' ').trim();
        const ancEl = $('.anc-info-head', el).first();
        const ancPos = $('.pos', ancEl).text().replace(/\s+/g, ' ').trim();
        const posTitle = posgramText
            ? `${headerWord} ${posgramText}`
            : ancPos
                ? `${headerWord} ${ancPos}`
                : headerWord;
        // 词性（兜底用）：posgram；短语词条用 anc-info-head
        const posRaw = ($('.posgram', el).text() || $('.anc-info-head', el).text()).replace(/\s+/g, ' ').trim();
        // 还原页面位置：pos-body 内按 DOM 顺序遍历 dsense（分组标题取页面 dsense_h 原文，
        // 如 "dig verb (MOVE SOIL)"）与习语/短语动词 xref 区（页面底栏，如 "习语\ndig your heels in"）。
        // 无 dsense_h 的词条（not / build / iceberg）页面本身没有分组栏 → 标题留空，不拼造。
        let looseLines: string[] | null = null;
        const flushLoose = () => {
            if (looseLines && looseLines.length) {
                additions.push({ name: '', value: looseLines.join('\n').replace(/\n+$/, '') });
            }
            looseLines = null;
        };
        const groupLines = (blocks: Cheerio<Element>): string[] => {
            const lines: string[] = [];
            blocks.each((_, blockEl) => {
                // 词组面板（if not / or not / dig someone in the ribs）标题 → (标题) 圆括号
                const phraseTitle = $(blockEl).parents('.phrase-block').find('.phrase-title').first().text().replace(/\s+/g, ' ').trim();
                // 等级徽章(.epp-xref) + 语法标签(.gram) 组合（如 "B1 [ I or T ]" / "[ T ]"）；用法标签(.lab) 单独成行圆括号
                const lv = $('.def-info .epp-xref', blockEl).text().replace(/\s+/g, ' ').trim();
                const gram = $('.def-info .gram', blockEl).text().replace(/\s+/g, ' ').trim();
                const lab = $('.def-info .lab', blockEl).text().replace(/\s+/g, ' ').trim();
                const segLine = [lv, gram].filter(Boolean).join(' ');
                // 空行规则：普通释义块（无词组标题 && 无用法标签）后空行；词组/标签块紧凑
                const isPlain = !phraseTitle && !lab;
                const en = $('.ddef_d', blockEl).text().replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');
                // 中文释义必须是 def-body 的直接子级 .trans，避免误取例句块的翻译
                const cn = $('.def-body', blockEl).children('.trans').first().text().replace(/\s+/g, ' ').trim();
                // 逐行还原页面：词组标题 / 等级+语法 / 用法标签（仅标签时圆括号）/ 释义
                if (phraseTitle) {
                    lines.push(`(${phraseTitle})`);
                }
                if (segLine) {
                    lines.push(lab ? `${segLine} ${lab}` : segLine);
                } else if (lab) {
                    lines.push(`(${lab})`);
                }
                lines.push(en);
                // 中文释义：普通块收进分组区（去重后统一展示），词组面板（圆括号式）的保留原位不加入分组
                if (cn) {
                    if (phraseTitle) {
                        lines.push(`> ${cn}`);
                    } else {
                        cnWords.push(cn);
                    }
                }
                let exampleCnt = 0;
                $('.examp', blockEl).each((_, exEl) => {
                    if (exampleCnt >= MAX_EXAMPLES_PER_DEF) {
                        return;
                    }
                    const enExample = $('.eg', exEl).text().replace(/\s+/g, ' ').trim();
                    const cnExample = $('.trans', exEl).first().text().replace(/\s+/g, ' ').trim();
                    lines.push(cnExample ? `• ${enExample}  ${cnExample}` : `• ${enExample}`);
                    exampleCnt++;
                });
                if (isPlain) {
                    lines.push('');
                }
            });
            return lines;
        };
        const handleSense = (senseEl: AnyNode) => {
            const blocks = $('.def-block', senseEl);
            if (!blocks.length) {
                return;
            }
            const h3 = $('.dsense_h', senseEl).text().replace(/\s+/g, ' ').trim();
            const lines = groupLines(blocks);
            if (!lines.length) {
                return;
            }
            if (h3) {
                flushLoose();
                additions.push({ name: h3, value: lines.join('\n').replace(/\n+$/, '') });
            } else {
                (looseLines ??= []).push(...lines);
            }
        };
        // 本词性段在 additions 中的起点（xref 收集合并只在本词性内查找）
        const posStart = additions.length;
        // 该词性下 xref 区序号（习语/短语动词各自从①起，区标题不同避免混淆）
        const xrefSeq: Record<string, number> = { 习语: 0, 短语动词: 0 };
        const circle = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
        const numbered = (name: string, items: string[]): string => {
            const rows: string[] = [];
            for (const t of items) {
                const i = xrefSeq[name]++;
                rows.push(`${i < circle.length ? circle[i] : String(i + 1)} ${t}`);
            }
            return rows.join('\n');
        };
        const collect = (root: Cheerio<AnyNode>) => {
            root.children().each((_, child) => {
                const cls = $(child).attr('class') || '';
                if (cls.includes('dsense')) {
                    handleSense(child);
                } else if (/(^|\s)xref(\s|$)/.test(` ${cls} `)) {
                    // 习语 / 短语动词：固定在词性下（DOM 原位），逐条分行 + 序号前缀；
                    // 排除 grammar（用法笔记）与 related_words（相关词语）区
                    const isIdiom = /idiom/.test(cls);
                    const isPhrasal = /phrasal_verbs/.test(cls);
                    if (!isIdiom && !isPhrasal) {
                        return;
                    }
                    const items = [...new Set($('.x-h', child).map((_, x) => $(x).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean))];
                    if (!items.length) {
                        return;
                    }
                    const name = isPhrasal ? '短语动词' : '习语';
                    const rows = numbered(name, items);
                    // 同一词性可能有多个同区 xref（idioms / idiom），并入本词性段内最近一条同名段（序号接续）；
                    // 限定 posStart 之后 —— 绝不跨词性合并（每个词性有各自的习语）
                    const prev = [...additions].slice(posStart).reverse().find((a) => a.name === name);
                    if (prev) {
                        prev.value += '\n' + rows;
                    } else {
                        flushLoose();
                        additions.push({ name, value: rows });
                    }
                }
            });
        };
        const cnWords: string[] = [];
        // 收集本词性下所有普通块的 cnWords 由 groupLines 填充（上面）
        const posBody = $('.pos-body', el).first();
        if (posBody.length) {
            collect(posBody);
        } else {
            // 兜底：无 pos-body 结构（短语词条页）时按 dsense 后代顺序分组
            const senseEls = $('.dsense', el);
            if (senseEls.length) {
                senseEls.each((_, s) => handleSense(s));
            } else {
                const blocks = $('.def-block', el);
                if (blocks.length) {
                    (looseLines ??= []).push(...groupLines(blocks));
                }
            }
        }
        flushLoose();
        if (cnWords.length) {
            // 词性级中文释义分组（普通块中释去重保序），先暂存，最后统一前置到 additions 开头
            cnGroups.push({ name: posTitle, items: [...new Set(cnWords)] });
        }
    });
    // 中释分组区：放在 additions 最前 —— 即词形变化（exchanges）之后第一行
    const cnGroupsFront = cnGroups.flatMap((g) => [{ name: g.name, value: g.items.join('\n') }]);
    additions.unshift(...cnGroupsFront);
    const res = {
        from: 'en',
        to: 'zh-Hans',
        fromParagraphs: [
            word
        ],
        toDict: {
            phonetics,
            additions,
            exchanges,
            word: word
        },
        raw: '',
        toParagraphs: [ word ],
    }
    completion({
        result: res
    });
    Bob.api.$log.info(`res${JSON.stringify(res)}`);
}

const cache = new Bob.Cache();
const INSTALL = "__INSTALLED";

const makePhonetic = ($textEl: Cheerio<AnyNode>, $audioEl: Cheerio<AnyNode>, type: string): Phonetic => {
    const value = $textEl.first().text() ?? '';
    const audio = $audioEl.attr('src');
    return {
        type,
        value,
        tts: audio ? {
            type: 'url',
            value: `${baseUrl}${audio}`
        } : undefined
    }
}

const buryPoint = (eventName) => {
    Bob.api.$http
        .post<{ status: 1 | 0 }>({
            url: "https://api.mixpanel.com/track?verbose=1&%69%70=1",
            header: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: {
                data: JSON.stringify([
                    {
                        event: eventName,
                        properties: {
                            token: "756388d6385bd7d3b849b18e4016c84a",
                            identifier: Bob.api.$info.identifier,
                            version: Bob.api.$info.version,
                        },
                    },
                ]),
            },
        })
        .finally(() => {
            cache.set(INSTALL, Bob.api.$info.version);
        });
};
const otherLang: Array<[string, string]> = [
    "af",
    "ar",
    "az",
    "bg",
    "bn",
    "bs",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fa",
    "fi",
    "fr",
    "gu",
    "he",
    "hi",
    "hr",
    "id",
    "it",
    "ja",
    "ka",
    "km",
    "kn",
    "ko",
    "lo",
    "lt",
    "lv",
    "mk",
    "ml",
    "mn",
    "mr",
    "ms",
    "my",
    "nl",
    "no",
    "pa",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sl",
    "sv",
    "ta",
    "te",
    "th",
    "tl",
    "tr",
    "uk",
    "ur",
    "vi",
    "ab",
    "sq",
    "ay",
    "ba",
    "bi",
    "nb",
    "ca",
    "cv",
    "eo",
    "ee",
    "fj",
    "lg",
    "kl",
    "ht",
    "tn",
    "ho",
    "iu",
    "ki",
    "kg",
    "kj",
    "lu",
    "mh",
    "ng",
    "nd",
    "os",
    "qu",
    "sm",
    "sg",
    "st",
    "nr",
    "ss",
    "ty",
    "tt",
    "ti",
    "to",
    "ts",
    "tk",
    "tw",
].map((e) => [e, e]);

const items: Array<[string, string]> = [["zh-Hans", "zh"], ["zh-Hant", "zh-Hant"], ...otherLang];
const langMap = new Map(items);
function supportLanguages() {
    if (!cache.get(INSTALL)) {
        // 没有安装过
        buryPoint("plugin-installed");
    } else if (cache.get(INSTALL) !== Bob.api.$info.version) {
        // 更新版本或安装了最初版本，标识为 true
        buryPoint("plugin-updated");
    }
    return ['zh-Hans','en'];
}