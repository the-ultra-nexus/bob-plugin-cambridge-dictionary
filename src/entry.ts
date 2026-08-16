import * as Bob from "@bob-plug/core";
import { load, Cheerio, AnyNode } from 'cheerio';
import { Part, Phonetic } from './helper/types';

const baseUrl = 'https://dictionary.cambridge.org';
// 每个释义块最多收集的例句数
const MAX_EXAMPLES_PER_DEF = 2;
// slug 清洗：空白归一 → 空格转 - → 非 [\w-] 字符（( ) / , ' . 等）转 - → 合并连续 - → 去首尾 -
// 保留大小写（iPhone / eBay 等专有名词不被破坏）
const buildSlug = (text: string): string =>
    text.trim()
        .split(/\s+/)
        .join('-')
        .replace(/[^\w-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
// zh-CN 双语入口（中文路径段保持字面量，architecture.md）
const ZHS_PREFIX = 'https://dictionary.cambridge.org/zhs/%E8%AF%8D%E5%85%B8/%E8%8B%B1%E8%AF%AD-%E6%B1%89%E8%AF%AD-%E7%AE%80%E4%BD%93';
// 英文站（变体解析入口：plugin→plug-in、近形短语 slug→canonical 词条页）
const EN_PREFIX = 'https://dictionary.cambridge.org/dictionary/english';

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
    // 守卫：仅 en→zh-Hans；空文本；空格分隔 token > 8 拦截（多词短语/习语上限）
    if (query.detectFrom !== 'en' || !query.text || query.text.trim().split(/\s+/).length > 8) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    const slug = buildSlug(query.text);
    // 清洗后为空或仍超长（句子级输入兜底）→ notFound，不发请求
    if (!slug || slug.length > 64) {
        completion({
            error: {
                type: 'notFound',
            }
        });
        return;
    }
    // 统一 en→zhs 双站管道：请求 1 英文站解析 canonical headword → 请求 2 双语站取完整内容
    resolveHeadword(slug, completion);
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
    // 词形变化 → 纯文本一行（不可点击），作为 additions 第一条：
    //   "present participle digging | past tense and past participle dug"
    // 不再使用 Bob exchanges（words 可点击跳查，用户要求不可点击）
    const inflections: string[] = [];
    $('.entry-body__el').each((_, el) => {
        $('.irreg-infls .inf-group', el).each((_, g) => {
            const lab = $('.lab', g).text().replace(/\s+/g, ' ').trim();
            const inf = $('.inf', g).text().replace(/\s+/g, ' ').trim();
            if (lab && inf) {
                inflections.push(`${lab} ${inf}`);
            }
        });
    });
    const inflectionLine = inflections.join(' | ');

    // additions 按词性分组 + 分隔线（不作为独立 addition，而是嵌入上一块 value 末尾）：
    //   [0] name=""        → 变形行（纯文本不可点击）："present participle digging | past tense and past participle dug"
    //   [1] name="verb"    → 词性汇总（Bob 原生渲染 name 为加粗标题）："挖，挖掘（土）；凿出，打（洞）"
    //   [2] name="noun"    → 词性汇总，最后一条 value 末尾嵌入 ====："...\n\n==============================..."
    //   [3] name="verb"    → verb 详细区（多词性时，中间详细块末尾嵌入 ====）
    //   [4] name="noun"    → noun 详细区（最后一块不嵌 ====）
    // 为什么不在 name="" 的独立 addition 里放 ====：Bob trim 首尾空白，独立块的前导换行无法产生视觉空行。
    // 注意：def-block 可能嵌套在 phrase-block（词组区域）中（如 not 页的 if not / or not），
    // 词组标题取 .phrase-title；中文释义必须是 def-body 的直接子级 .trans
    // （用 children(.trans) 隔离，避免误取例句块的翻译文本）。
    // 分隔线 60 个 =（用户偏好，不作为独立 addition，而嵌入上一块 value 末尾，
    // 因为 Bob 渲染独立 name="" addition 时会 trim 前导/尾随换行，无法产生视觉空行）
    const EQUALS_LINE = '='.repeat(60);
    // 收集每个词性的数据：纯词性标签 + 中文释义(概要) + 详细内容行
    const posData: Array<{ posLabel: string; cnMeanings: string[]; lines: string[] }> = [];
    $('.entry-body__el').each((_, el) => {
        // 纯词性标签（不含语法标签如 [T] [C]）：.posgram > .pos
        // 短语词条（posgram 空）取 anc-info-head 内的词性
        const posLabel = $('.posgram .pos', el).first().text().replace(/\s+/g, ' ').trim()
            || $('.anc-info-head .pos', el).first().text().replace(/\s+/g, ' ').trim();
        if (!posLabel) {
            return;
        }
        const cnMeanings: string[] = [];
        const lines: string[] = [];

        let looseLines: string[] | null = null;
        const flushLoose = () => {
            if (looseLines && looseLines.length) {
                lines.push(...looseLines);
                // 末尾加空行保证与后续内容分隔
                if (looseLines[looseLines.length - 1] !== '') {
                    lines.push('');
                }
            }
            looseLines = null;
        };
        const groupLines = (blocks: Cheerio<Element>): string[] => {
            const result: string[] = [];
            blocks.each((_, blockEl) => {
                // 词组面板（if not / or not / dig someone in the ribs）标题 → (标题) 圆括号
                const phraseTitle = $(blockEl).parents('.phrase-block').find('.phrase-title').first().text().replace(/\s+/g, ' ').trim();
                // 等级徽章(.epp-xref) + 语法标签(.gram) 组合（如 "B1 [ I or T ]" / "[ T ]"）；用法标签(.lab) 单独成行圆括号
                const lv = $('.def-info .epp-xref', blockEl).text().replace(/\s+/g, ' ').trim();
                const gram = $('.def-info .gram', blockEl).text().replace(/\s+/g, ' ').trim();
                const lab = $('.def-info .lab', blockEl).text().replace(/\s+/g, ' ').trim();
                const segLine = [lv, gram].filter(Boolean).join(' ');
                // 每块释义后空一行（含词组面板/标签块，用户要求块之间始终空行）
                const en = $('.ddef_d', blockEl).text().replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');
                // 中文释义必须是 def-body 的直接子级 .trans，避免误取例句块的翻译
                const cn = $('.def-body', blockEl).children('.trans').first().text().replace(/\s+/g, ' ').trim();
                // 逐行还原页面：词组标题 / 等级+语法 / 用法标签（仅标签时圆括号）/ 释义
                if (phraseTitle) {
                    result.push(`(${phraseTitle})`);
                }
                if (segLine) {
                    result.push(lab ? `${segLine} ${lab}` : segLine);
                } else if (lab) {
                    result.push(`(${lab})`);
                }
                result.push(en);
                // 中文释义：始终在详细区显示 > 前缀；普通块同时收集到概要
                if (cn) {
                    // > 后一个空格（用户要求）：用 > 前缀渲染中文释义，普通块同时收集到概要
                    result.push(`> ${cn}`);
                    if (!phraseTitle) {
                        cnMeanings.push(cn);
                    }
                }
                let exampleCnt = 0;
                $('.examp', blockEl).each((_, exEl) => {
                    if (exampleCnt >= MAX_EXAMPLES_PER_DEF) {
                        return;
                    }
                    const enExample = $('.eg', exEl).text().replace(/\s+/g, ' ').trim();
                    const cnExample = $('.trans', exEl).first().text().replace(/\s+/g, ' ').trim();
                    result.push(cnExample ? `    • ${enExample}  ${cnExample}` : `    • ${enExample}`);
                    exampleCnt++;
                });
                result.push('');
            });
            return result;
        };
        const handleSense = (senseEl: AnyNode) => {
            const blocks = $('.def-block', senseEl);
            if (!blocks.length) {
                return;
            }
            const blockLines = groupLines(blocks);
            if (!blockLines.length) {
                return;
            }
            // dsense_h 标题不单独显示，内容直接追加到 looseLines
            (looseLines ??= []).push(...blockLines);
        };
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
                    // 每个 xref 直接追加到 lines（带标题行），flushLoose 确保与前面释义块分隔
                    flushLoose();
                    lines.push(name);
                    lines.push(rows);
                    lines.push('');
                }
            });
        };
        // 收集本词性下所有内容
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
        posData.push({ posLabel, cnMeanings: [...new Set(cnMeanings)], lines });
    });
    // 从 posData 构建 additions
    const additions: Array<{ name: string; value: string }> = [];
    if (posData.length > 0) {
        // 0. 变形行（不可点击纯文本）
        if (inflectionLine) {
            additions.push({ name: '', value: inflectionLine });
        }
        // 1. 词性汇总：每词性一条，name = 词性标签（Bob 原生渲染为加粗标题），value = 中文释义（；拼接）
        //    最后一条汇总 value 末尾嵌入 ====（前置 \n\n 让 ==== 上方有空行）
        const summaryEntries = posData.filter(p => p.cnMeanings.length > 0);
        summaryEntries.forEach((p, i) => {
            const isLastSummary = i === summaryEntries.length - 1;
            additions.push({ name: p.posLabel, value: p.cnMeanings.join('；') + (isLastSummary ? '\n\n' + EQUALS_LINE : '') });
        });
        // 2. 每词性详细区（含习语/短语动词，DOM 原位）。
        //    除最后一块外，每个详细块 value 末尾嵌入 ====（"详细 → 详细"分隔；
        //    "汇总 → 详细"分隔由汇总最后一条末尾的 ==== 提供）
        posData.forEach((p, i) => {
            const isLastDetail = i === posData.length - 1;
            const detail = p.lines.join('\n').replace(/\n+$/, '');
            additions.push({ name: p.posLabel, value: detail + (isLastDetail ? '' : '\n\n' + EQUALS_LINE) });
        });
    }
    const res = {
        from: 'en',
        to: 'zh-Hans',
        fromParagraphs: [
            word
        ],
        toDict: {
            phonetics,
            additions,
            exchanges: [],
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

// 页面是否含词条（与 main() 内部同一判定选择器 .headword）
const hasHeadword = (file: any): boolean => !!load(file)('.headword').html();

// 唯一请求封装：先查 res.error（网络错误 → log + notFound，绝不在错误响应上 load），
// 再判 .headword 存在性（无词条页 → notFound）；通过后才交给 onParse。每条路径 completion 恰好一次。
const lookup = (url: string, onParse: (file: any) => void, completion) => {
    Bob.api.$http.get({
        url,
        handler: (res) => {
            if (res.error) {
                Bob.api.$log.error(`reserr: ${JSON.stringify(res.error)}`);
                completion({
                    error: {
                        type: 'notFound',
                    }
                });
                return;
            }
            if (!hasHeadword(res.data)) {
                completion({
                    error: {
                        type: 'notFound',
                    }
                });
                return;
            }
            onParse(res.data);
        }
    });
};

// 请求 1（英文站解析）：en 页只提取 .headword 文本（其内嵌中文为截断预览，不得作输出源），
// buildSlug 得 canonical slug → 请求 2（zhs 双语站）→ main 解析 / notFound。无递归、无环，≤2 次请求。
const resolveHeadword = (slug: string, completion) => {
    lookup(`${EN_PREFIX}/${encodeURIComponent(slug)}`, (file) => {
        const $ = load(file);
        const canonicalSlug = buildSlug($('.headword').first().text());
        // 病态页面防御：en 页 .headword 存在但文本为空 → notFound，绝不向 zhs 首页发请求
        if (!canonicalSlug) {
            completion({
                error: {
                    type: 'notFound',
                }
            });
            return;
        }
        lookup(`${ZHS_PREFIX}/${encodeURIComponent(canonicalSlug)}`, (zhsFile) => {
            main(zhsFile, completion);
        }, completion);
    }, completion);
};

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