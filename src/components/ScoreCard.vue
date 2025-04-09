<script>

</script>

<template>
<div class="maimai-card-wrapper">
    <div class="maimai-result-card">
        <div class="song-jacket-section">
            <div class="song-jacket-image" style="background-image: url('https://www.diving-fish.com/covers/11512.png');"></div>
        </div>
        <div class="result-details-section">
            <div class="result-header">
                <div class="header-pill">
                    <div class="pill-section charttype">DX</div>
                    <div class="pill-section level">13.7</div>
                    <div class="pill-section points">308</div>
                </div>
            </div>
            <div class="song-name">きゅうくらりん</div>
            <div class="achievement">100.5000<span class="percentage-mark">%</span></div>
            <div class="achievement-badges">
                <div class="rank-achievement">
                    <img class="achievement-icon" src="/sssplus.png">
                </div>
                <div class="fc-achievement">
                    <img class="achievement-icon" src="" v-if="false">
                </div>
                <div class="sync-achievement">
                    <img class="achievement-icon" src="" v-if="false">
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
    background: linear-gradient(90deg, #9966cc 0%, #6633cc 100%);
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
}

.achievement-icon {
    width: 80%;
    height: 80%;
    object-fit: contain;
}

.rank-achievement .achievement-icon {
    width: 100%;
    height: 100%;
}
</style>