import type { KaleidxscopeGate, KaleidxscopeLifePhase, KaleidxscopeSong } from "./type";

function song(musicId: number, title: string): KaleidxscopeSong {
    return { musicId, title };
}

function makeSongs(entries: Array<[number, string]>): KaleidxscopeSong[] {
    return entries.map(([musicId, title]) => song(musicId, title));
}

function phase(
    startsAt: string,
    difficulty: KaleidxscopeLifePhase["difficulty"],
    life: number
): KaleidxscopeLifePhase {
    return { startsAt, difficulty, life };
}

const blueKeySongs = makeSongs([
    [11009, "STEREOSCAPE"],
    [11008, "Crazy Circle"],
    [11100, "シエルブルーマルシェ"],
    [11097, "ブレインジャックシンドローム"],
    [11098, "共鳴"],
    [11099, "Ututu"],
    [11163, "REAL VOICE"],
    [11162, "ユメヒバナ"],
    [11161, "オリフィス"],
    [11228, "星めぐり、果ての君へ。"],
    [11229, "スローアライズ"],
    [11231, "生命不詳"],
    [11739, "184億回のマルチトニック"],
    [11463, "RIFFRAIN"],
    [11464, "Falling"],
    [11465, "ピリオドサイン"],
    [11538, "アンバークロニクル"],
    [11539, "リフヴェイン"],
    [11541, "宵の鳥"],
    [11620, "フェイクフェイス・フェイルセイフ"],
    [11622, "シックスプラン"],
    [11623, "フタタビ"],
    [11737, "パラドクスイヴ"],
    [11738, "YKWTD"],
    [11164, "パラボラ"],
    [11230, "チエルカ／エソテリカ"],
    [11466, "群青シグナル"],
    [11540, "Kairos"],
    [11621, "ふらふらふら、"],
]);

const blueTrack1 = makeSongs([
    [11008, "Crazy Circle"],
    [11009, "STEREOSCAPE"],
    [11100, "シエルブルーマルシェ"],
    [11097, "ブレインジャックシンドローム"],
    [11098, "共鳴"],
    [11099, "Ututu"],
    [11161, "オリフィス"],
    [11162, "ユメヒバナ"],
    [11163, "REAL VOICE"],
    [11228, "星めぐり、果ての君へ。"],
    [11229, "スローアライズ"],
    [11231, "生命不詳"],
    [11463, "RIFFRAIN"],
    [11464, "Falling"],
    [11465, "ピリオドサイン"],
    [11538, "アンバークロニクル"],
    [11539, "リフヴェイン"],
    [11541, "宵の鳥"],
    [11620, "フェイクフェイス・フェイルセイフ"],
    [11622, "シックスプラン"],
    [11623, "フタタビ"],
    [11737, "パラドクスイヴ"],
    [11738, "YKWTD"],
]);

const blueTrack2 = makeSongs([
    [11164, "パラボラ"],
    [11230, "チエルカ／エソテリカ"],
    [11466, "群青シグナル"],
    [11540, "Kairos"],
    [11621, "ふらふらふら、"],
    [11739, "184億回のマルチトニック"],
]);

const whiteKeySongs = makeSongs([
    [11102, "封焔の135秒"],
    [11234, "ほしぞらスペクタクル"],
    [11300, "U&iVERSE -銀河鸞翔-"],
    [11529, "ツムギボシ"],
    [11542, "ここからはじまるプロローグ。 (Kanon Remix)"],
    [11612, "Latent Kingdom"],
]);

const whiteTrack1 = makeSongs([
    [11027, "アポカリプスに反逆の焔を焚べろ"],
    [11101, "GRÄNDIR"],
    [11103, "渦状銀河のシンフォニエッタ"],
    [11166, "ワンダーシャッフェンの法則"],
    [11167, "BIRTH"],
    [11236, "Last Samurai"],
    [11237, "蒼穹舞楽"],
    [11301, "華の集落、秋のお届け"],
    [11303, "星詠みとデスペラード"],
    [11387, "星空パーティーチューン"],
    [11388, "チューリングの跡"],
    [11386, "Swift Swing"],
    [11467, "Beat Opera op.1"],
    [11468, "星見草"],
    [11469, '"411Ψ892"'],
    [11682, "Geranium"],
    [11683, "The Cursed Doll"],
    [11684, "RondeauX of RagnaroQ"],
    [11742, "Ourania"],
    [11743, "天蓋"],
]);

const whiteTrack2 = makeSongs([
    [11026, "TEmPTaTiON"],
    [11102, "封焔の135秒"],
    [11165, "Regulus"],
    [11238, "AMABIE"],
    [11302, "BLACK SWAN"],
    [11389, "Sage"],
    [11470, "康莊大道"],
    [11685, "ℝ∈Χ LUNATiCA"],
    [11744, "Deicide"],
]);

const purpleKeySongs = makeSongs([
    [328, "言ノ葉カルマ"],
    [403, "悪戯"],
    [457, "言ノ葉遊戯"],
    [458, "りばーぶ"],
    [532, "洗脳"],
    [533, "Barbed Eye"],
    [559, "空威張りビヘイビア"],
    [568, "分からない"],
    [613, "天国と地獄 -言ノ葉リンネ-"],
    [626, "相思創愛"],
    [673, "咲キ誇レ常世ノ華"],
    [11001, "BLACK ROSE"],
    [11002, "Secret Sleuth"],
    [11104, "ヤミツキ"],
    [11105, "ワードワードワード"],
    [11168, "シアトリカル・ケース"],
    [11169, "ステップアンドライム"],
    [11170, "届かない花束"],
    [11365, "アンビバレンス"],
    [11380, "パーフェクション"],
    [11381, "デーモンベット"],
    [11456, "分解収束テイル"],
    [11532, "ヱデン"],
    [11533, "にゃーにゃー冒険譚"],
    [11613, "Mystic Parade"],
    [11614, "Cry Cry Cry"],
    [11747, "地獄"],
    [11748, "シスターシスター"],
]);

const purpleTrack1 = purpleKeySongs.slice(0, 11);
const purpleTrack2 = purpleKeySongs.slice(11);

const blackKeySongs = makeSongs([
    [11023, "Blows Up Everything"],
    [11106, "Valsqotch"],
    [11221, '≠彡"/了→'],
    [11222, "BREaK! BREaK! BREaK!"],
    [11300, "U&iVERSE -銀河鸞翔-"],
    [11374, "GIGANTØMAKHIA"],
    [11458, "Rising on the horizon"],
    [11523, "ViRTUS"],
    [11619, "KHYMΞXΛ"],
    [11663, "系ぎて"],
    [11746, "Divide et impera!"],
]);

const blackTrack1 = makeSongs([
    [11019, "Scarlet Wings"],
    [11020, "Technicians High"],
    [11021, "魔ジョ狩リ"],
    [11022, "TwisteD! XD"],
    [11090, "Flashkick"],
    [11091, "Stardust Memories"],
    [11092, "My My My"],
    [11157, "Aetheric Energy"],
    [11158, "Komplexe"],
    [11159, "Beautiful Future"],
    [11232, "Never Give Up!"],
    [11233, "Starry Colors"],
    [11234, "ほしぞらスペクタクル"],
    [11304, "Round Round Spinning Around"],
    [11305, "Alcyone"],
    [11306, "Raven Emperor"],
    [11382, "HECATONCHEIR"],
    [11383, "Irresistible"],
    [11384, "HAGAKIRI"],
    [11459, "You Mean the World to Me"],
    [11460, "Neon Kingdom"],
    [11461, "#狂った民族２ PRAVARGYAZOOQA"],
    [11615, "ぽわわん劇場"],
    [11616, "my flow"],
    [11617, "POWER OF UNITY"],
    [11674, "Cider P@rty"],
    [11675, "勦滅"],
    [11676, "Lunatic Vibes"],
    [11750, "Flashback"],
    [11751, "Colorfull:Encounter"],
]);

const blackTrack2 = makeSongs([
    [11023, "Blows Up Everything"],
    [11089, "STEEL TRANSONIC"],
    [11160, "Mutation"],
    [11235, "VIIIbit Explorer"],
    [11307, "Yorugao"],
    [11385, "N3V3R G3T OV3R"],
    [11462, "VSpook!"],
    [11618, "Energizing Flame"],
    [11677, "Bloody Trail"],
    [11752, "雨露霜雪"],
]);

const yellowKeySongs = makeSongs([
    [11003, "でらっくmaimai♪てんてこまい!"],
    [11095, "絡めトリック利己ライザー"],
    [11152, "ぼくたちいつでも しゅわっしゅわ！"],
    [11224, "Paradisoda"],
    [11296, "とびだせ！TO THE COSMIC!!"],
    [11375, "ミルキースター・シューティングスター"],
    [11452, "ホシシズク"],
    [11529, "ツムギボシ"],
    [11608, "NOIZY BOUNCE"],
    [11669, "エスオーエス"],
    [11736, "プリズム△▽リズム"],
    [11806, "Fraq"],
]);

const yellowTrack1 = makeSongs([
    [11003, "でらっくmaimai♪てんてこまい!"],
    [11007, "超常マイマイン"],
    [11006, "P-qoq"],
    [11005, "バーチャルダム　ネーション"],
    [11094, "ここからはじまるプロローグ。"],
    [11095, "絡めトリック利己ライザー"],
    [11096, "モ°ルモ°ル"],
    [11152, "ぼくたちいつでも　しゅわっしゅわ！"],
    [11153, "Boys O'Clock"],
    [11154, "居並ぶ穀物と溜息まじりの運送屋"],
    [11224, "Paradisoda"],
    [11225, "VANTABLACK RAVER"],
    [11226, "時計の国のジェミニ"],
    [11296, "とびだせ！TO THE COSMIC!!"],
    [11297, "噛み係"],
    [11298, "トリアージ"],
    [11375, "ミルキースター・シューティングスター"],
    [11376, "ｉｓｏｐｈｏｔｅ"],
    [11377, "パラマウント☆ショータイム！！"],
    [11452, "ホシシズク"],
    [11453, "Rainbow Rush Story"],
    [11454, "Tricolor⁂circuS"],
    [11526, "トノサマビーム"],
    [11527, "enchanted wanderer"],
    [11528, "Comet Panto Men!"],
    [11608, "NOIZY BOUNCE"],
    [11609, "サンバディ！"],
    [11610, "Horoscope Express"],
    [11669, "エスオーエス"],
    [11670, "のじゃロリック"],
    [11671, "Edelweiss"],
    [11806, "Fraq"],
    [11807, "ウタヒメナイトストーム"],
]);

const yellowTrack2 = makeSongs([
    [11004, "MAXRAGE"],
    [11093, "UniTas"],
    [11155, "ARAIS"],
    [11227, "Xenovcipher"],
    [11299, "NAGAREBOSHI☆ROCKET"],
    [11378, "Strive against fate"],
    [11455, "[X]"],
    [11529, "ツムギボシ"],
    [11611, "Party☆People☆Princess"],
    [11672, "QuiQ"],
    [11808, "Feel The Luv"],
]);

const redKeySongs = makeSongs([
    [212, "神室雪月花"],
    [213, "KONNANじゃないっ！"],
    [337, "鼓動"],
    [270, "Outlaw's Lullaby"],
    [271, "Brand-new Japanesque"],
    [11504, "ばかみたい【Taxi Driver Edition】"],
    [339, "DRAGONLADY"],
    [453, "Garden Of The Dragon"],
    [11336, "ドラゴンエネルギー"],
    [11852, "好きな惣菜発表ドラゴン"],
]);

const redTrack1 = makeSongs([
    [11016, "キリキリ舞Mine"],
    [11017, "福宿音屋魂音泉"],
    [11018, "Now or Never"],
    [11015, "一か罰"],
    [11545, "隠密あんみつDX"],
    [11546, "地球"],
    [11547, "Churros Parlor"],
    [11548, "超熊猫的周遊記（ワンダーパンダートラベラー）"],
    [11678, "RE:INCARNATED DRAGNER"],
    [11679, "Beginning together!"],
    [11680, "Shining Ray ～僕らの絆～"],
    [11681, "DEVOTION"],
    [11811, "概して過誤"],
    [11812, "Unfinished Epic"],
]);

const redTrack2 = makeSongs([
    [11015, "一か罰"],
    [11548, "超熊猫的周遊記（ワンダーパンダートラベラー）"],
    [11681, "DEVOTION"],
    [11813, "忙シー日"],
]);

export const kaleidxscopeGates: readonly KaleidxscopeGate[] = [
    {
        id: "blue",
        name: "蓝色之门",
        shortName: "蓝门",
        region: "青春区域",
        openedAt: "2026-01-23T10:00:00+08:00",
        keyCondition: {
            summary: "游玩全部 29 首青春区域曲目",
            songs: blueKeySongs,
        },
        lifePhases: [
            phase("2026-01-23T10:00:00+08:00", "MASTER", 1),
            phase("2026-01-26T04:00:00+08:00", "MASTER", 10),
            phase("2026-01-29T04:00:00+08:00", "MASTER", 30),
            phase("2026-02-01T04:00:00+08:00", "MASTER", 50),
            phase("2026-02-05T04:00:00+08:00", "EXPERT", 100),
            phase("2026-02-12T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            { track: 1, description: "青春区域课题曲", selection: "random", songs: blueTrack1 },
            {
                track: 2,
                description: "青春区域完美挑战曲",
                selection: "random",
                songs: blueTrack2,
            },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11740, "果ての空、僕らが見た光。")],
            },
        ],
    },
    {
        id: "white",
        name: "白色之门",
        shortName: "白门",
        region: "天界区域 8 / 神明地域",
        openedAt: "2026-02-10T07:00:00+08:00",
        keyCondition: {
            summary:
                "设置背景「Latent Kingdom」后，同一局连续游玩 3 首（单人）或 4 首（双人）不重复的作曲家含「奏音」曲目",
            songs: whiteKeySongs,
        },
        lifePhases: [
            phase("2026-02-10T07:00:00+08:00", "MASTER", 1),
            phase("2026-02-13T04:00:00+08:00", "MASTER", 10),
            phase("2026-02-16T04:00:00+08:00", "MASTER", 30),
            phase("2026-02-19T04:00:00+08:00", "MASTER", 50),
            phase("2026-02-23T04:00:00+08:00", "EXPERT", 100),
            phase("2026-03-02T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            { track: 1, description: "天界区域课题曲", selection: "random", songs: whiteTrack1 },
            {
                track: 2,
                description: "天界区域完美挑战曲",
                selection: "random",
                songs: whiteTrack2,
            },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11745, "氷滅の135小節")],
            },
        ],
    },
    {
        id: "purple",
        name: "紫色之门",
        shortName: "紫门",
        region: "BLACK ROSE 区域 10",
        openedAt: "2026-03-25T10:00:00+08:00",
        keyCondition: {
            summary:
                "旅行伙伴队长设置为 BLACK ROSE 区域的アウル或其任意变种，并在同一局连续游玩 3 首（单人）或 4 首（双人）不重复的言ノ葉Project 曲目",
            songs: purpleKeySongs,
        },
        lifePhases: [
            phase("2026-03-25T10:00:00+08:00", "MASTER", 1),
            phase("2026-03-28T04:00:00+08:00", "MASTER", 10),
            phase("2026-03-31T04:00:00+08:00", "MASTER", 30),
            phase("2026-04-03T04:00:00+08:00", "MASTER", 50),
            phase("2026-04-07T04:00:00+08:00", "EXPERT", 100),
            phase("2026-04-15T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            { track: 1, description: "随机抽选池 A", selection: "random", songs: purpleTrack1 },
            { track: 2, description: "随机抽选池 B", selection: "random", songs: purpleTrack2 },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11749, "有明/Ariake")],
            },
        ],
    },
    {
        id: "black",
        name: "黑色之门",
        shortName: "黑门",
        region: "メトロポリス区域 9",
        openedAt: "2026-04-28T10:00:00+08:00",
        keyCondition: {
            summary: "游玩全部 11 首 KOP6 及以前的 KOP 曲目",
            songs: blackKeySongs,
        },
        lifePhases: [
            phase("2026-04-28T10:00:00+08:00", "MASTER", 1),
            phase("2026-05-01T04:00:00+08:00", "MASTER", 10),
            phase("2026-05-04T04:00:00+08:00", "MASTER", 30),
            phase("2026-05-07T04:00:00+08:00", "MASTER", 50),
            phase("2026-05-11T04:00:00+08:00", "EXPERT", 100),
            phase("2026-05-18T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            {
                track: 1,
                description: "メトロポリス区域课题曲",
                selection: "random",
                songs: blackTrack1,
            },
            {
                track: 2,
                description: "メトロポリス区域完美挑战曲",
                selection: "random",
                songs: blackTrack2,
            },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11753, "宙天")],
            },
        ],
    },
    {
        id: "yellow",
        name: "黄色之门",
        shortName: "黄门",
        region: "七彩区域",
        openedAt: "2026-06-10T10:00:00+08:00",
        keyCondition: {
            summary: "使用游戏内随机选曲抽到版本主题曲之一，并游玩其中 1 首",
            songs: yellowKeySongs,
        },
        lifePhases: [
            phase("2026-06-10T10:00:00+08:00", "MASTER", 1),
            phase("2026-06-13T04:00:00+08:00", "MASTER", 10),
            phase("2026-06-17T04:00:00+08:00", "MASTER", 30),
            phase("2026-06-19T04:00:00+08:00", "MASTER", 50),
            phase("2026-06-23T04:00:00+08:00", "EXPERT", 100),
            phase("2026-06-30T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            { track: 1, description: "七彩区域课题曲", selection: "random", songs: yellowTrack1 },
            {
                track: 2,
                description: "七彩区域完美挑战曲",
                selection: "random",
                songs: yellowTrack2,
            },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11809, "Åntinomiε")],
            },
        ],
    },
    {
        id: "red",
        name: "红色之门",
        shortName: "红门",
        region: "龙之区域 4",
        openedAt: "2026-08-05T10:00:00+08:00",
        keyCondition: {
            summary: "游玩全部 10 首下列曲目",
            songs: redKeySongs,
        },
        lifePhases: [
            phase("2026-08-05T10:00:00+08:00", "MASTER", 1),
            phase("2026-08-08T04:00:00+08:00", "MASTER", 10),
            phase("2026-08-11T04:00:00+08:00", "MASTER", 30),
            phase("2026-08-14T04:00:00+08:00", "MASTER", 50),
            phase("2026-08-18T04:00:00+08:00", "EXPERT", 100),
            phase("2026-08-25T04:00:00+08:00", "BASIC", 999),
        ],
        selectionPools: [
            {
                track: 1,
                description: "世界树区域课题曲",
                selection: "random",
                songs: redTrack1,
            },
            {
                track: 2,
                description: "世界树区域完美挑战曲与「一か罰」",
                selection: "random",
                songs: redTrack2,
            },
            {
                track: 3,
                description: "固定门曲",
                selection: "fixed",
                songs: [song(11814, "FLΛME/FRΦST")],
            },
        ],
    },
];
