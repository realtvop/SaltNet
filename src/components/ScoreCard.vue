<script>

</script>

<template>
<div class="maimai-card-wrapper">
    <div class="maimai-result-card">
        <div class="song-jacket-section">
            <div class="song-jacket-image" :style="{ 'background-image': `url('https://www.diving-fish.com/covers/${'0'.repeat(5 - $attrs.data.song_id.toString().length)}${$attrs.data.song_id}.png')`}"></div>
        </div>
        <div class="result-details-section">
            <div class="result-header">
                <div class="header-pill">
                    <div class="pill-section charttype">{{ $attrs.data.type }}</div>
                    <div class="pill-section level" :style="{ background: `#${['45c124', 'ffba01', 'ff7b7b', '9f51dc', 'dbaaff', 'ff6ffd'][$attrs.data.level_index]}` }">{{ $attrs.data.ds }}</div>
                    <div class="pill-section points">{{ $attrs.data.ra }}</div>
                </div>
            </div>
            <div class="song-name">{{ $attrs.data.title }}</div>
            <div class="achievement">{{ $attrs.data.achievements.toFixed(4) }}<span class="percentage-mark">%</span></div>
            <div class="achievement-badges">
                <div class="rank-achievement">
                    <img class="achievement-icon" :src="`/icons/${$attrs.data.rate.replace('p', 'plus')}.png`">
                </div>
                <div class="fc-achievement">
                    <img class="achievement-icon" :src="`/icons/music_icon_${$attrs.data.fc}.png`" v-if="$attrs.data.fc">
                </div>
                <div class="sync-achievement">
                    <img class="achievement-icon" :src="`/icons/music_icon_${$attrs.data.fs.replace('sd', 'dx')}.png`" v-if="$attrs.data.fs">
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.maimai-card-wrapper {
    width: 100%;
    max-width: none;
    padding: 5px;
    box-sizing: border-box;
}

.maimai-result-card {
    display: flex;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
    background: #333;
    border: 1.5px solid #555;
    aspect-ratio: 2.5 / 1;
    width: 100%;
    height: auto;
    min-height: 90px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.2s ease; /* 添加过渡效果让颜色变化更平滑 */
}

.maimai-result-card:hover {
    border-color: white;
}

.song-jacket-section {
    flex: 0 0 40%;
    position: relative;
}

.song-jacket-image {
    width: 100%;
    height: 100%;
    position: absolute;
    background-size: cover;
    background-position: center;
}

.result-details-section {
    flex: 0 0 60%;
    padding: 6px;
    color: white;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 60%;
    box-sizing: border-box;
}

.result-header {
    margin-bottom: 1.5px;
    height: 15px;
    flex-shrink: 0;
}

.header-pill {
    display: flex;
    height: 100%;
    border-radius: 7.5px;
    overflow: hidden;
    margin-left: 1.5%;
    width: 90%;
}

.pill-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 9px;
    text-align: center;
    padding: 0 2.25px;
}

.pill-section.charttype {
    background-color: white;
    color: #ff6600;
    flex-grow: 0.5;
}

.pill-section.level {
    color: white;
    flex-grow: 0.75;
}

.pill-section.points {
    background: linear-gradient(90deg, #ff9933 0%, #ff6600 100%);
    color: white;
}

.song-name {
    font-size: 10.5px;
    font-weight: bold;
    margin-top: 1.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    width: 100%;
    max-width: 100%;
    display: block;
    box-sizing: border-box;
}

.achievement {
    font-size: 19.5px;
    font-weight: bold;
    line-height: 1;
    margin-bottom: 1.5px;
    flex-shrink: 0;
}

.percentage-mark {
    font-size: 12px;
}

.achievement-badges {
    display: flex;
    justify-content: space-around;
    align-items: center;
    gap: 4.5px;
    flex-shrink: 0;
    margin-left: -5%;
    width: 100%;
    margin-top: 1.5px;
}

.rank-achievement, .fc-achievement, .sync-achievement {
    width: 22.5px;
    height: 22.5px;
    display: flex;
    justify-content: center;
    align-items: center;
}

.rank-achievement {
    background: transparent;
    border: none;
    box-shadow: none;
    flex-grow: 0.4;
}

.fc-achievement, .sync-achievement {
    background: #666;
    border-radius: 50%;
    position: relative;
    overflow: hidden;
}

.achievement-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    position: absolute;
}

.rank-achievement .achievement-icon {
    position: relative;
    top: unset;
    left: unset;
    transform: none;
}
</style>