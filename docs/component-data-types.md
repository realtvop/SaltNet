# 组件数据类型说明

本文档详细说明了项目中各个组件使用的曲目和谱面数据类型，包括数据来源、转换过程和最终结构。

## 数据来源与API接口

### 1. DivingFish API
**API地址**: `https://www.diving-fish.com/api/maimaidxprober`

#### 玩家数据查询接口 (`/query/player`)
```typescript
// 请求体
{
    username: string,  // 用户名
    b50: "1"          // 获取B50数据
}

// 响应体 (DivingFishResponse)
{
    username: string;         // 用户名
    nickname: string;         // 昵称
    plate: string | null;     // 段位
    additional_rating: number; // 段位分
    rating: number;           // 总Rating
    records?: DivingFishFullRecord[]; // 全部成绩记录
    charts: DivingFishB50;    // B50数据
}
```

#### 曲目数据接口 (`/music_data`)
```typescript
// 响应体 (MusicDataResponse = MusicInfo[])
{
    id: string;               // 曲目ID
    title: string;            // 曲目标题
    type: ChartType;          // 谱面类型
    ds: number[];             // 定数数组
    level: string[];          // 难度标识数组
    cids: number[];           // 谱面ID数组
    charts: ChartInfo[];      // 谱面信息数组
    basic_info: BasicInfo;    // 基本信息
    aliases?: string[];       // 别名
}
```

### 2. InGame API (自建后端)
**API地址**: `${VITE_API_URL}`

#### 用户更新接口 (`/updateUser`)
```typescript
// 请求体
{
    userId: number,           // 游戏内用户ID
    importToken?: string      // 导入令牌
}

// 响应体 (UpdateUserResponse)
{
    userName: string;         // 用户名
    iconId: number;           // 头像ID
    rating: number;           // Rating
    userMusicList: UserMusic[]; // 游戏内音乐数据
    divingFishData: DivingFishFullRecord[]; // 转换后的水鱼格式数据
    b50: DivingFishB50;       // B50数据
    isLogin: boolean;         // 是否在线
}
```

## 数据转换流程详解

### 1. 音乐数据转换 (`convertDFMusicList`)
**位置**: `src/types/music.ts`

```typescript
function convertDFMusicList(data: MusicDataResponse): SavedMusicList {
    const musicList: MusicList = {};
    const chartList: ChartList = {};

    for (const item of data) {
        // 创建Music对象
        const music: Music = {
            title: item.basic_info.title,
            aliases: item.aliases,
            artist: item.basic_info.artist,
            genre: item.basic_info.genre,
            bpm: item.basic_info.bpm,
            from: item.basic_info.from,
            isNew: item.basic_info.is_new,
            type: item.type,
            id: Number(item.id),
            charts: []
        };

        // 为每个难度创建Chart对象
        for (const dfChart of item.charts) {
            const chart: Chart = {
                music: music,
                id: item.cids[index],     // 谱面ID
                grade: index,             // 难度等级
                notes: dfChart.notes,     // 物量信息
                charter: dfChart.charter, // 谱师
                level: item.level[index], // 难度标识
                ds: item.ds[index]        // 定数
            };
            music.charts.push(chart);
            chartList[chart.id] = chart;
        }
        musicList[music.id] = music;
    }

    return { musicList, chartList };
}
```

### 2. 用户详细数据转换 (`convertDetailed`)
**位置**: `src/types/user.ts`

```typescript
function convertDetailed(data: DivingFishFullRecord[]): DetailedData {
    const result: DetailedData = {};
    // 将数组转换为以"曲目ID-难度等级"为key的对象
    for (const item of data) {
        result[`${item.song_id}-${item.level_index}`] = item;
    }
    return result;
}
```

### 3. B50数据转换 (`genScoreCardDataFromB50`)
**位置**: `src/pages/b50.vue`

```typescript
function genScoreCardDataFromB50(record: DivingFishFullRecord): ChartCardData {
    if (!musicInfo) {
        // 仅用B50原始数据构造卡片
        return {
            song_id: record.song_id,
            title: record.title || "",
            ds: record.ds ?? 0,
            grade: record.level_index ?? 0,
            level_index: record.level_index ?? 0,
            type: record.type || "",
            achievements: typeof record.achievements === "number" ? record.achievements : undefined,
            ra: typeof record.ra === "number" ? record.ra : undefined,
            rate: record.rate || "",
            fc: record.fc || "",
            fs: record.fs || "",
            charter: record.charter || "",
            music: undefined
        };
    }
    
    // 从音乐信息映射表获取完整谱面信息
    const chart = musicChartMap.value.get(`${record.song_id}-${record.level_index}`);
    if (!chart) {
        // 找不到谱面信息时的兜底处理
        return /* 同上面的返回结构 */;
    }
    
    // 合并谱面信息和成绩数据
    return {
        ...chart,                    // 包含所有Chart字段
        song_id: chart.music.id,
        title: chart.music.title,
        ds: chart.ds,
        grade: chart.grade,
        level_index: chart.grade,
        type: chart.music.type,
        achievements: typeof record.achievements === "number" ? record.achievements : undefined,
        ra: typeof record.ra === "number" ? record.ra : undefined,
        rate: record.rate || "",
        fc: record.fc || "",
        fs: record.fs || "",
        charter: chart.charter,
        music: chart.music           // 完整音乐信息
    };
}
```

### 4. Songs页面数据转换 (`genScoreCardData`)
**位置**: `src/pages/songs.vue`

```typescript
function genScoreCardData(chart: ChartExtended): ChartCardData {
    // 从用户详细数据中查找对应成绩
    const chartData = playerData.value?.data.detailed
        ? playerData.value?.data.detailed[`${chart.music.id}-${chart.grade}`]
        : null;
    
    return {
        ...chart,                    // 包含所有ChartExtended字段
        song_id: chart.music.id,
        title: chart.music.title,
        // 成绩数据(如果用户有游玩记录)
        achievements: chartData?.achievements ?? null,
        ra: chart.index ?? "",      // 使用排序索引作为ra显示
        rate: chartData?.rate ?? "",
        fc: chartData?.fc ?? "",
        fs: chartData?.fs ?? ""
    };
}
```

## 组件数据获取详细流程

### ChartInfoDialog组件
**文件路径**: `src/components/b50/ChartInfoDialog.vue`

#### 数据获取流程
1. **接收数据**: 通过props接收`ChartCardData`
2. **好友数据**: 从localStorage读取所有用户数据
3. **成绩对比**: 使用`${chart.song_id}-${chart.level_index}`作为key查找各用户的detailed数据
4. **排名计算**: 对好友成绩按达成率降序排序，计算排名

#### 主要Props类型
```typescript
interface Props {
    open: boolean;
    chart: ChartCardData | null;
}
```

#### 获取到的数据结构
```typescript
// chart数据 (ChartCardData)
{
    song_id: number;           // 曲目ID
    title: string;             // 曲目标题
    ds: number;                // 定数
    grade: number;             // 难度等级索引
    level_index: number;       // 难度等级索引
    type: string;              // 谱面类型 ("SD"/"DX")
    achievements?: number;     // 达成率
    ra?: number | string;      // Rating值
    rate?: string;             // 评级
    fc?: string;               // Full Combo状态
    fs?: string;               // Full Sync状态
    charter?: string;          // 谱师
    music?: Music;             // 完整音乐信息 (用于展示别名、艺术家等)
}

// 好友成绩数据
friendsScores: {
    name: string;              // 好友名称
    achievements?: number;     // 达成率
    ra?: number;              // Rating
    rate?: string;            // 评级
    fc?: string;              // FC状态
    fs?: string;              // FS状态
    played: boolean;          // 是否游玩过
}[]
```

### ScoreCard组件
**文件路径**: `src/components/ScoreCard.vue`

#### 数据获取流程
1. **接收数据**: 通过props接收`ChartCardData`
2. **封面显示**: 使用song_id构造封面URL: `https://www.diving-fish.com/covers/${padded_id}.png`
3. **成绩展示**: 直接使用ChartCardData中的字段显示

#### 主要Props类型
```typescript
interface Props {
    data: ChartCardData;
}
```

#### 获取到的数据结构
使用与ChartInfoDialog相同的`ChartCardData`接口，主要用于显示：
- 曲目封面 (通过song_id获取)
- 曲目信息 (title, type, ds)
- 成绩信息 (achievements, ra, rate, fc, fs)

### B50页面组件
**文件路径**: `src/pages/b50.vue`

#### 数据获取流程
1. **用户数据**: 从localStorage获取用户列表，取第一个用户
2. **B50数据**: 从`user.data.b50.sd`和`user.data.b50.dx`获取
3. **数据转换**: 使用`genScoreCardDataFromB50`转换每条记录
4. **音乐信息补充**: 通过musicChartMap查找完整谱面信息

#### 主要数据类型

##### User 接口
```typescript
interface User {
    divingFish: {
        name: string | null;     // 水鱼查分器用户名
        importToken?: string | null;
    };
    inGame: {
        name?: string | null;    // 游戏内昵称
        id: number | null;       // 游戏内ID
    };
    data: {
        updateTime: number | null;  // 更新时间
        rating?: number | null;     // 总Rating
        b50?: DivingFishB50;       // B50数据
        detailed?: DetailedData;    // 详细成绩数据
    };
}
```

##### DivingFishB50 接口
```typescript
interface DivingFishB50 {
    dx: DivingFishFullRecord[];  // 新版本最佳15曲
    sd: DivingFishFullRecord[];  // 旧版本最佳35曲
}
```

##### DivingFishFullRecord 接口
```typescript
interface DivingFishFullRecord {
    achievements: number;        // 达成率
    ds: number;                 // 定数
    dxScore: number;            // DX分数
    fc: ComboStatus;            // FC状态
    fs: SyncStatus;             // FS状态
    level: string;              // 难度标识 (如"13+")
    level_index: number;        // 难度索引 (0-4)
    level_label: string;        // 难度标签 (Basic, Advanced, Expert, Master, Re:Master)
    ra: number;                 // 单曲Rating
    rate: RankRate;             // 评级
    song_id: number;            // 曲目ID
    title: string;              // 曲目标题
    type: "DX" | "SD";         // 谱面类型
}
```

### ScoreSection组件
**文件路径**: `src/components/ScoreSection.vue`

#### 数据获取流程
1. **接收数据**: 通过props接收`ChartCardData[]`
2. **统计计算**: 计算平均值、中位数、极差等统计信息
3. **网格展示**: 遍历scores数组，每个元素传递给ScoreCard组件

#### 主要Props类型
```typescript
interface Props {
    title: string;                    // 区段标题
    scores: ChartCardData[];          // 谱面卡片数据数组
    chartInfoDialog: {                // 对话框状态
        open: boolean;
        chart: ChartCardData | null;
    };
}
```

#### 计算的统计数据
```typescript
// stats计算结果
{
    avg: string;          // 平均Rating (保留2位小数)
    median: number;       // 中位数Rating
    range: number;        // Rating极差 (最高-最低)
    levelRange: string;   // 定数范围 (如"13.0~14.9")
}
```

### Songs页面组件
**文件路径**: `src/pages/songs.vue`

#### 数据获取流程
1. **音乐库**: 从`src/assets/music/index.ts`加载完整音乐库
2. **排序处理**: 使用MusicSort进行自定义排序
3. **成绩关联**: 通过`genScoreCardData`关联用户成绩数据
4. **筛选功能**: 按难度筛选，支持曲名、艺术家、谱师、别名搜索

#### 主要数据类型

##### ChartExtended 接口
```typescript
interface ChartExtended extends Chart {
    index?: string;              // 排序索引 (如"1/100")
    originalIndex?: number;      // 原始排序索引
    totalInDifficulty?: number;  // 该难度总数
    music: Music;                // 完整音乐信息
    id: number;                  // 谱面ID
    notes: [number, number, number, number];  // 物量信息 [tap, hold, slide, break]
    charter: string;             // 谱师
    level: string;               // 难度标识
    grade: number;               // 难度等级
    ds: number;                  // 定数
}
```

##### Chart 接口
```typescript
interface Chart {
    music: Music;                // 关联的音乐信息
    id: number;                  // 谱面ID
    notes: [number, number, number, number];  // 物量信息
    charter: string;             // 谱师
    level: string;               // 难度标识
    grade: number;               // 难度等级 (0-4)
    ds: number;                  // 定数
}
```

##### Music 接口
```typescript
interface Music {
    title: string;             // 曲目标题
    aliases?: string[];        // 别名列表
    artist: string;            // 艺术家
    genre: MusicGenre;         // 音乐类型
    bpm: number;               // BPM
    from: MusicOrigin;         // 来源版本
    isNew: boolean;            // 是否为新版本曲目
    type: ChartType;           // 谱面类型 ("SD"/"DX")
    id: number;                // 曲目ID
    charts: Chart[];           // 该曲目的所有谱面
}
```

## 枚举类型

### ComboStatus (FC状态)
```typescript
enum ComboStatus {
    None = "",
    FullCombo = "fc",
    FullComboPlus = "fcp",
    AllPerfect = "ap",
    AllPerfectPlus = "app",
}
```

### SyncStatus (FS状态)
```typescript
enum SyncStatus {
    None = "",
    FullSync = "fs",
    FullSyncPlus = "fsp",
    FullSyncDX = "fsdx",
    FullSyncDXPlus = "fspdx",
}
```

### RankRate (评级)
```typescript
enum RankRate {
    d = "d", c = "c", b = "b", bb = "bb", bbb = "bbb",
    a = "a", aa = "aa", aaa = "aaa",
    s = "s", sp = "sp", ss = "ss", ssp = "ssp",
    sss = "sss", sssp = "sssp",
}
```

### ChartType (谱面类型)
```typescript
enum ChartType {
    Standard = "SD",    // 标准谱面
    Deluxe = "DX",     // DX谱面
}
```

### MusicGenre (音乐类型)
```typescript
enum MusicGenre {
    "舞萌", "流行&动漫", "其他游戏", "niconico & VOCALOID",
    "niconicoボーカロイド", "东方Project", "音击&中二节奏",
    "ゲームバラエティ", "POPSアニメ", "maimai",
    "オンゲキCHUNITHM", "東方Project", "宴会場",
}
```

## 数据缓存机制

### 1. 用户数据缓存
- **存储位置**: localStorage
- **缓存key**: "users"
- **数据结构**: `User[]`
- **更新时机**: 用户手动更新成绩时

### 2. 音乐库缓存
- **存储位置**: 静态资源 (`src/assets/music/charts.json`)
- **加载方式**: 编译时导入
- **数据转换**: 启动时通过`convertDFMusicList`转换

### 3. 谱面排序缓存
- **存储位置**: localStorage
- **缓存key**: "chartsSortCached"
- **数据结构**: `ChartsSortCached`
- **缓存标识**: 用户名 + 更新时间 + 版本构建时间
- **失效条件**: 标识不匹配时重新计算排序

## 数据一致性保证

### 1. 谱面ID映射
- B50数据和Songs页面都使用`${song_id}-${level_index}`作为谱面唯一标识
- 详细成绩数据(`detailed`)也使用相同的key格式

### 2. 数据类型转换
- 所有组件最终都使用统一的`ChartCardData`接口
- 不同数据源通过转换函数标准化为相同格式

### 3. 兜底处理
- 音乐信息缺失时提供默认值
- 成绩数据缺失时显示为空或使用占位符

## 注意事项

- `ChartCardData`是专为卡片组件设计的轻量化数据结构
- 可选字段(带`?`)在某些场景下可能为`undefined`，组件需做好兜底处理
- `achievements`、`ra`等成绩相关字段仅在用户有游玩记录时存在
- `music`字段为可选，主要用于详情弹窗等需要完整信息的场景
- 数据更新涉及多个API调用和转换，需要处理异步操作和错误情况
