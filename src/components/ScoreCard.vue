<script>

</script>

<template>
  <div class="maimai-card-wrapper">
    <div class="maimai-result-card">
        <div class="song-jacket-section">
            <div class="song-jacket-image" style="background-image: url('https://www.diving-fish.com/covers/11512.png');">
                <!-- Song jacket image loaded from background-image -->
            </div>
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
            <div class="accuracy-score">100.5000<span class="percentage-mark">%</span></div>
            <div class="achievement-badges">
                <div class="rank-achievement">
                    <img class="achievement-icon" src="" alt="SSS+">
                </div>
                <div class="fc-achievement">
                    <img class="achievement-icon" src="" alt="FC">
                </div>
                <div class="sync-achievement">
                    <img class="achievement-icon" src="" alt="SYNC">
                </div>
            </div>
        </div>
    </div>
</div>
</template>

<style scoped>
.maimai-card-wrapper {
    width: 100%;
    max-width: 450px;
    padding: 10px;
    box-sizing: border-box;
}

.maimai-result-card {
    display: flex;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    background: #333;
    border: 2px solid #555;
    aspect-ratio: 2.5 / 1;
    height: auto;
    min-height: 120px;
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
    padding: 8px;
    color: white;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.result-header {
    margin-bottom: 2px;
    height: 20px;
    flex-shrink: 0;
}

.header-pill {
    display: flex;
    height: 100%;
    border-radius: 10px;
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
    font-size: 12px;
    text-align: center;
    padding: 0 3px;
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
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
}

.accuracy-score {
    font-size: 26px;
    font-weight: bold;
    line-height: 1;
    margin-bottom: 2px;
    flex-shrink: 0;
}

.percentage-mark {
    font-size: 16px;
}

.achievement-badges {
    display: flex;
    justify-content: space-around;
    align-items: center;
    /* margin-top: auto; */
    /* padding-top: 2px; */
    gap: 6px;
    flex-shrink: 0;
    margin-left: -5%;
}

.rank-achievement, .fc-achievement, .sync-achievement {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.rank-achievement {
    background: radial-gradient(circle, #ffcc33 0%, #ff9900 100%);
    border: 2px solid #ffdd66;
    box-shadow: 0 0 5px #ffcc33;
}

.fc-achievement {
    background: radial-gradient(circle, #33cc33 0%, #009900 100%);
    border: 2px solid #66ff66;
    box-shadow: 0 0 5px #33cc33;
}

.sync-achievement {
    background: radial-gradient(circle, #66ccff 0%, #0099cc 100%);
    border: 2px solid #99ddff;
    box-shadow: 0 0 5px #66ccff;
}

.achievement-icon {
    width: 80%;
    height: 80%;
    object-fit: contain;
}
</style>