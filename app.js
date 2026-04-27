const locations = [
  { id: "sejong", name: "세종시", lat: 36.4801, lon: 127.289 },
  { id: "seoul", name: "서울 성수", lat: 37.5446, lon: 127.0557 },
  { id: "bundang", name: "성남 분당", lat: 37.3784, lon: 127.1142 },
  { id: "songdo", name: "인천 송도", lat: 37.3861, lon: 126.6435 },
  { id: "ilsan", name: "고양 일산", lat: 37.6584, lon: 126.7728 },
  { id: "suji", name: "용인 수지", lat: 37.3223, lon: 127.0952 },
  { id: "hanam", name: "하남 미사", lat: 37.5674, lon: 127.1909 },
  { id: "busan", name: "부산 해운대", lat: 35.1631, lon: 129.1636 },
  { id: "daegu", name: "대구 수성", lat: 35.8587, lon: 128.6308 },
  { id: "daejeon", name: "대전 둔산", lat: 36.3519, lon: 127.3785 },
  { id: "gwangju", name: "광주 수완", lat: 35.1903, lon: 126.8206 },
  { id: "jeju", name: "제주 노형", lat: 33.4854, lon: 126.4778 },
  { id: "gangneung", name: "강릉 교동", lat: 37.7659, lon: 128.8761 },
];

const fallbackWeather = {
  apparent: 12,
  temp: 13,
  rain: 0,
  wind: 9,
  humidity: 55,
  code: 2,
};

const state = {
  selectedLocationId: "sejong",
  selectedLocation: locations[0],
  targetWeather: null,
  matchedRegions: [],
  posts: [],
  filters: {
    age: "all",
    rainOnly: false,
    windOnly: false,
  },
};

let instagramEmbedScriptPromise = null;

const $ = (selector) => document.querySelector(selector);

const elements = {
  locationSelect: $("#location-select"),
  postRegion: $("#post-region"),
  geoButton: $("#geo-button"),
  refreshButton: $("#refresh-button"),
  weatherStatus: $("#weather-status"),
  locationNote: $("#location-note"),
  apparentTemp: $("#apparent-temp"),
  weatherLabel: $("#weather-label"),
  weatherSummary: $("#weather-summary"),
  rainMetric: $("#rain-metric"),
  windMetric: $("#wind-metric"),
  humidityMetric: $("#humidity-metric"),
  regionStrip: $("#region-strip"),
  feedGrid: $("#feed-grid"),
  matchTitle: $("#match-title"),
  outfitInsight: $("#outfit-insight"),
  resultCount: $("#result-count"),
  curationForm: $("#curation-form"),
  resetFilter: $("#reset-filter"),
  rainFilter: $("#rain-filter"),
  windFilter: $("#wind-filter"),
};

function init() {
  state.posts = loadUserPosts();
  hydrateLocationSelects();
  attachEvents();
  refreshWeather();
}

function hydrateLocationSelects() {
  elements.locationSelect.innerHTML = locations
    .map((location) => `<option value="${location.id}">${location.name}</option>`)
    .join("");
  elements.postRegion.innerHTML = locations
    .map((location) => `<option value="${location.id}">${location.name}</option>`)
    .join("");
  elements.locationSelect.value = state.selectedLocationId;
}

function attachEvents() {
  elements.locationSelect.addEventListener("change", (event) => {
    const nextLocation =
      event.target.value === "current"
        ? state.selectedLocation
        : locations.find((location) => location.id === event.target.value);
    if (!nextLocation) return;
    setSelectedLocation(nextLocation);
  });

  elements.geoButton.addEventListener("click", useGeolocation);
  elements.refreshButton.addEventListener("click", refreshWeather);

  document.querySelectorAll("[data-filter='age']").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters.age = button.dataset.value;
      document.querySelectorAll("[data-filter='age']").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderFeed();
    });
  });

  elements.rainFilter.addEventListener("change", (event) => {
    state.filters.rainOnly = event.target.checked;
    renderFeed();
  });

  elements.windFilter.addEventListener("change", (event) => {
    state.filters.windOnly = event.target.checked;
    renderFeed();
  });

  elements.resetFilter.addEventListener("click", () => {
    state.filters = { age: "all", rainOnly: false, windOnly: false };
    elements.rainFilter.checked = false;
    elements.windFilter.checked = false;
    document.querySelectorAll("[data-filter='age']").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.value === "all");
    });
    renderFeed();
  });

  elements.curationForm.addEventListener("submit", addCuratedPost);
}

function setSelectedLocation(location) {
  state.selectedLocationId = location.id;
  state.selectedLocation = location;
  elements.locationSelect.value = location.id;
  elements.locationNote.textContent = "선택한 지역을 기준으로 비슷한 아침 날씨를 찾고 있어요.";
  refreshWeather();
}

async function useGeolocation() {
  if (!navigator.geolocation) {
    elements.locationNote.textContent = "이 브라우저에서는 현재 위치 기능을 사용할 수 없어요.";
    return;
  }

  setStatus("위치 확인", "live");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const current = {
        id: "current",
        name: "현재 위치",
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      state.selectedLocationId = current.id;
      state.selectedLocation = current;
      ensureCurrentLocationOption();
      elements.locationSelect.value = current.id;
      elements.locationNote.textContent =
        "현재 위치 좌표를 기준으로 계산 중이에요. 지역명은 브라우저에서 제공하지 않아 좌표만 사용합니다.";
      await refreshWeather();
    },
    () => {
      elements.locationNote.textContent =
        "위치 권한을 받을 수 없어 선택 지역 기준으로 계속 볼게요.";
      setStatus("선택 지역", "live");
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  );
}

async function refreshWeather() {
  setStatus("날씨 로딩", "live");
  try {
    const target = await fetchMorningWeather(state.selectedLocation);
    const regionalWeather = await Promise.all(
      locations.map(async (location) => ({
        ...location,
        weather: await fetchMorningWeather(location),
      })),
    );

    state.targetWeather = target;
    state.matchedRegions = regionalWeather
      .map((location) => ({
        ...location,
        score: weatherDistance(target, location.weather),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    setStatus("실시간", "live");
    renderWeather();
    renderRegions();
    renderFeed();
  } catch (error) {
    console.warn(error);
    state.targetWeather = fallbackWeather;
    state.matchedRegions = locations.slice(0, 5).map((location, index) => ({
      ...location,
      weather: { ...fallbackWeather, apparent: fallbackWeather.apparent + index - 1 },
      score: index,
    }));
    setStatus("데모 모드", "error");
    elements.locationNote.textContent =
      "날씨 API 연결에 실패해서 데모 날씨로 피드를 보여주고 있어요.";
    renderWeather();
    renderRegions();
    renderFeed();
  }
}

async function fetchMorningWeather(location) {
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    hourly:
      "temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m",
    forecast_days: "1",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status}`);
  }
  const data = await response.json();
  return normalizeMorningWeather(data.hourly);
}

function normalizeMorningWeather(hourly) {
  const indexes = hourly.time
    .map((time, index) => ({ time: new Date(time), index }))
    .filter(({ time }) => {
      const hour = time.getHours();
      return hour >= 7 && hour <= 9;
    })
    .map(({ index }) => index);

  const targetIndexes = indexes.length ? indexes : [0, 1, 2].filter((index) => hourly.time[index]);
  const avg = (values) =>
    targetIndexes.reduce((sum, index) => sum + Number(values[index] || 0), 0) / targetIndexes.length;
  const max = (values) =>
    targetIndexes.reduce((result, index) => Math.max(result, Number(values[index] || 0)), 0);
  const codeCounts = targetIndexes.reduce((counts, index) => {
    const code = hourly.weather_code[index] || 0;
    counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});
  const code = Number(
    Object.entries(codeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0,
  );

  return {
    apparent: Math.round(avg(hourly.apparent_temperature)),
    temp: Math.round(avg(hourly.temperature_2m)),
    rain: Number(max(hourly.precipitation).toFixed(1)),
    rainChance: Math.round(max(hourly.precipitation_probability)),
    wind: Math.round(avg(hourly.wind_speed_10m)),
    humidity: Math.round(avg(hourly.relative_humidity_2m)),
    code,
  };
}

function weatherDistance(a, b) {
  const rainGap = rainBucket(a.rain, a.rainChance) === rainBucket(b.rain, b.rainChance) ? 0 : 8;
  const codeGap = weatherFamily(a.code) === weatherFamily(b.code) ? 0 : 5;
  return (
    Math.abs(a.apparent - b.apparent) * 3 +
    Math.abs(a.temp - b.temp) * 1.5 +
    Math.abs(a.wind - b.wind) * 0.8 +
    Math.abs(a.humidity - b.humidity) * 0.25 +
    rainGap +
    codeGap
  );
}

function renderWeather() {
  const weather = state.targetWeather;
  const label = weatherLabel(weather);
  elements.apparentTemp.textContent = `${weather.apparent}°`;
  elements.weatherLabel.textContent = label;
  elements.weatherSummary.textContent = outfitSummary(weather);
  elements.rainMetric.textContent =
    weather.rain > 0 ? `${weather.rain}mm` : `${weather.rainChance || 0}%`;
  elements.windMetric.textContent = `${weather.wind}km/h`;
  elements.humidityMetric.textContent = `${weather.humidity}%`;
  elements.matchTitle.textContent = `${state.selectedLocation.name}와 비슷한 아침`;
}

function renderRegions() {
  elements.regionStrip.innerHTML = state.matchedRegions
    .map(
      (region) => `
        <article class="region-card">
          <strong>${escapeHtml(region.name)}</strong>
          <span>체감 ${region.weather.apparent}° · ${weatherLabel(region.weather)} · 유사도 ${Math.max(
            0,
            Math.round(100 - region.score),
          )}%</span>
        </article>
      `,
    )
    .join("");
}

function renderFeed() {
  const matchedRegionIds = new Set(state.matchedRegions.map((region) => region.id));
  const targetWeather = state.targetWeather || fallbackWeather;

  const visiblePosts = state.posts
    .filter((post) => matchedRegionIds.has(post.regionId) || weatherDistance(targetWeather, post.weather) < 24)
    .filter((post) => state.filters.age === "all" || post.age === state.filters.age)
    .filter((post) => !state.filters.rainOnly || post.weather.rain > 0 || post.weather.code >= 51)
    .filter((post) => !state.filters.windOnly || post.weather.wind >= 14)
    .map((post) => ({
      ...post,
      score: weatherDistance(targetWeather, post.weather),
    }))
    .sort((a, b) => a.score - b.score);

  elements.resultCount.textContent = `게시물 ${visiblePosts.length}개`;
  elements.outfitInsight.textContent = buildOutfitInsight(visiblePosts);

  if (!visiblePosts.length) {
    elements.feedGrid.innerHTML = $("#empty-state-template").innerHTML;
    elements.outfitInsight.textContent = "공개 인스타 게시물 URL을 등록하면 여기에서 볼 수 있어요.";
    return;
  }

  elements.feedGrid.innerHTML = visiblePosts.map(renderPostCard).join("");
  processInstagramEmbeds();
  document.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => removeUserPost(button.dataset.removeId));
  });
}

function renderPostCard(post) {
  const region = locations.find((location) => location.id === post.regionId);
  const match = Math.max(0, Math.round(100 - post.score));
  const removeButton = post.id.startsWith("user-")
    ? `<button type="button" data-remove-id="${escapeAttribute(post.id)}">삭제</button>`
    : "";

  return `
    <article class="post-card">
      ${renderInstagramEmbed(post.url)}
      <div class="post-body">
        <div class="post-meta">
          <div>
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(region?.name || "등록 지역")} · 체감 ${post.weather.apparent}° · ${weatherLabel(
              post.weather,
            )}</p>
          </div>
          <span class="score-badge">${match}%</span>
        </div>
        <p class="muted">${escapeHtml(post.note)}</p>
        ${renderTagRow(post.tags)}
        <div class="post-actions">
          <a href="${escapeAttribute(post.url)}" target="_blank" rel="noreferrer">원본 보기</a>
          ${removeButton}
        </div>
      </div>
    </article>
  `;
}

function addCuratedPost(event) {
  event.preventDefault();
  const url = normalizePostUrl($("#post-url").value.trim());
  const regionId = $("#post-region").value;
  const age = $("#post-age").value;
  const note = $("#post-note").value.trim() || "수동 등록한 등원룩 참고 링크";

  if (!url) {
    elements.locationNote.textContent = "인스타그램 공개 게시물 또는 릴스 URL만 등록할 수 있어요.";
    $("#post-url").focus();
    return;
  }

  const regionWeather =
    state.matchedRegions.find((region) => region.id === regionId)?.weather ||
    state.targetWeather ||
    fallbackWeather;
  const post = {
    id: `user-${makeId()}`,
    regionId,
    age,
    title: "공개 인스타 등원룩",
    note,
    url,
    tags: inferTags(note, regionWeather),
    weather: { ...regionWeather },
    palette: pickPalette(regionWeather),
  };

  state.posts = [post, ...state.posts];
  saveUserPosts();
  elements.curationForm.reset();
  $("#post-age").value = "preschool";
  renderFeed();
}

function renderInstagramEmbed(url) {
  const safeUrl = escapeAttribute(url);
  return `
    <div class="instagram-frame">
      <div class="embed-loader" aria-hidden="true">
        <span>Instagram 게시물을 불러오는 중</span>
      </div>
      <blockquote
        class="instagram-media"
        data-instgrm-permalink="${safeUrl}"
        data-instgrm-version="14">
        <div class="embed-fallback">
          <a href="${safeUrl}" target="_blank" rel="noreferrer">Instagram에서 공개 게시물 보기</a>
          <span>임베드가 차단되면 원본 링크로 열 수 있어요.</span>
        </div>
      </blockquote>
    </div>
  `;
}

function renderTagRow(tags) {
  if (!tags?.length) return "";
  return `
    <div class="tag-row">
      ${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function processInstagramEmbeds() {
  if (globalThis.instgrm?.Embeds?.process) {
    globalThis.instgrm.Embeds.process();
    markEmbedScriptLoaded();
    return;
  }

  loadInstagramEmbedScript()
    .then(() => {
      globalThis.instgrm?.Embeds?.process?.();
      markEmbedScriptLoaded();
    })
    .catch(() => {
      document.querySelectorAll(".instagram-frame").forEach((frame) => {
        frame.classList.add("is-embed-error");
      });
    });
}

function loadInstagramEmbedScript() {
  if (instagramEmbedScriptPromise) return instagramEmbedScriptPromise;

  instagramEmbedScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-instagram-embed]");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.instagram.com/embed.js";
    script.async = true;
    script.dataset.instagramEmbed = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.appendChild(script);
  });

  return instagramEmbedScriptPromise;
}

function markEmbedScriptLoaded() {
  document.querySelectorAll(".instagram-frame").forEach((frame) => {
    frame.classList.add("is-embed-ready");
  });
}

function ensureCurrentLocationOption() {
  if (elements.locationSelect.querySelector("option[value='current']")) return;
  const option = document.createElement("option");
  option.value = "current";
  option.textContent = "현재 위치";
  elements.locationSelect.prepend(option);
}

function normalizePostUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (host !== "instagram.com") return "";
    if (!/^\/(p|reel|tv)\//.test(url.pathname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function removeUserPost(id) {
  state.posts = state.posts.filter((post) => post.id !== id);
  saveUserPosts();
  renderFeed();
}

function loadUserPosts() {
  try {
    return JSON.parse(localStorage.getItem("curatedOutfitPosts") || "[]");
  } catch {
    return [];
  }
}

function saveUserPosts() {
  const userPosts = state.posts.filter((post) => post.id.startsWith("user-"));
  localStorage.setItem("curatedOutfitPosts", JSON.stringify(userPosts));
}

function setStatus(text, type) {
  elements.weatherStatus.textContent = text;
  elements.weatherStatus.classList.toggle("is-live", type === "live");
  elements.weatherStatus.classList.toggle("is-error", type === "error");
}

function weatherLabel(weather) {
  if (weather.rain > 0 || weather.code >= 51) return "비 대비";
  if (weather.wind >= 16) return "바람 있음";
  if (weather.apparent <= 0) return "매우 추움";
  if (weather.apparent <= 7) return "쌀쌀함";
  if (weather.apparent <= 14) return "선선함";
  if (weather.apparent <= 20) return "포근함";
  if (weather.apparent <= 27) return "더운 편";
  return "많이 더움";
}

function outfitSummary(weather) {
  if (weather.rain > 0 || weather.code >= 51) {
    return "우비, 방수 신발, 여벌 양말이 도움이 되는 아침이에요.";
  }
  if (weather.wind >= 16) {
    return "바람막이나 후드 집업처럼 가벼운 겉옷을 우선 보여줄게요.";
  }
  if (weather.apparent <= 7) {
    return "얇은 패딩이나 조끼를 겹쳐 입힌 사례를 먼저 보여줄게요.";
  }
  if (weather.apparent <= 14) {
    return "맨투맨, 가디건, 긴바지 조합이 참고하기 좋은 날이에요.";
  }
  if (weather.apparent <= 20) {
    return "가벼운 상의에 벗기 쉬운 겉옷을 더한 룩이 잘 맞아요.";
  }
  return "통풍 좋은 상의와 가벼운 하의를 중심으로 보여줄게요.";
}

function buildOutfitInsight(posts) {
  if (!posts.length) return "공개 인스타 게시물 URL을 등록하면 여기에서 볼 수 있어요.";
  return `${posts.length}개 공개 게시물을 날씨 유사도 순으로 정렬 중입니다.`;
}

function rainBucket(rain, chance = 0) {
  if (rain > 0 || chance >= 45) return "rain";
  return "dry";
}

function weatherFamily(code) {
  if (code >= 95) return "storm";
  if (code >= 71) return "snow";
  if (code >= 51) return "rain";
  if (code >= 45) return "fog";
  if (code >= 1) return "cloud";
  return "clear";
}

function inferTags(note, weather) {
  const tags = new Set();
  const source = note.replace(/\s+/g, "");
  ["패딩", "맨투맨", "조끼", "우비", "장화", "가디건", "바람막이", "레깅스"].forEach((tag) => {
    if (source.includes(tag)) tags.add(tag);
  });
  return [...tags].slice(0, 4);
}

function pickPalette(weather) {
  if (weather.rain > 0 || weather.code >= 51) return ["#dbe8f2", "#426a8f", "#d6a23f", "#fffdf8"];
  if (weather.wind >= 16) return ["#e8eadf", "#7d946a", "#426a8f", "#1f2927"];
  if (weather.apparent <= 10) return ["#d7ece7", "#c9674b", "#f4eee1", "#1f2927"];
  if (weather.apparent >= 22) return ["#f7ead8", "#426a8f", "#d6a23f", "#18786c"];
  return ["#f9f2e4", "#18786c", "#d6a23f", "#426a8f"];
}

function createOutfitImage(post) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1125;
  const ctx = canvas.getContext("2d");
  const [base, accent, warm, ink] = post.palette || pickPalette(post.weather);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawPattern(ctx, warm, ink);
  drawHanger(ctx, ink);
  drawTop(ctx, accent, ink, post.tags);
  drawBottom(ctx, warm, ink, post.tags);
  drawShoes(ctx, ink, accent);
  drawCaption(ctx, post, ink);

  return canvas.toDataURL("image/png");
}

function drawPattern(ctx, warm, ink) {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = warm;
  for (let y = 80; y < 1020; y += 190) {
    for (let x = 60; x < 820; x += 220) {
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  for (let x = 120; x < 900; x += 240) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 180, 1125);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawHanger(ctx, ink) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(450, 160);
  ctx.quadraticCurveTo(505, 120, 465, 85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(450, 160);
  ctx.lineTo(260, 255);
  ctx.lineTo(640, 255);
  ctx.closePath();
  ctx.stroke();
}

function drawTop(ctx, accent, ink, tags) {
  const isRain = tags.some((tag) => ["우비", "방수신발", "장화"].includes(tag));
  const isVest = tags.includes("조끼");
  const isCardigan = tags.includes("가디건");

  ctx.fillStyle = accent;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  roundRect(ctx, 285, 250, 330, 380, 34, true, true);
  ctx.fillStyle = lighten(accent, 28);
  if (!isVest) {
    roundRect(ctx, 185, 290, 110, 270, 42, true, true);
    roundRect(ctx, 605, 290, 110, 270, 42, true, true);
  }
  if (isRain) {
    ctx.fillStyle = "#f1cf57";
    roundRect(ctx, 330, 205, 240, 95, 48, true, true);
  }
  if (isCardigan || isVest) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(450, 265);
    ctx.lineTo(450, 620);
    ctx.stroke();
  }
  ctx.fillStyle = "#fffdf8";
  ctx.beginPath();
  ctx.arc(450, 270, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBottom(ctx, warm, ink, tags) {
  const shorts = tags.some((tag) => ["반바지", "반팔"].includes(tag));
  ctx.fillStyle = warm;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  roundRect(ctx, 320, 620, 110, shorts ? 210 : 330, 26, true, true);
  roundRect(ctx, 470, 620, 110, shorts ? 210 : 330, 26, true, true);
}

function drawShoes(ctx, ink, accent) {
  ctx.fillStyle = "#fffdf8";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 9;
  roundRect(ctx, 285, 940, 170, 72, 32, true, true);
  roundRect(ctx, 445, 940, 170, 72, 32, true, true);
  ctx.fillStyle = accent;
  roundRect(ctx, 330, 965, 80, 14, 7, true, false);
  roundRect(ctx, 490, 965, 80, 14, 7, true, false);
}

function drawCaption(ctx, post, ink) {
  ctx.fillStyle = "rgba(255, 253, 248, 0.86)";
  roundRect(ctx, 70, 1018, 760, 64, 14, true, false);
  ctx.fillStyle = ink;
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(`${post.tags.slice(0, 2).join(" + ")}`, 100, 1058);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function lighten(hex, percent) {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const amount = Math.round(2.55 * percent);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0x00ff) + amount);
  const b = Math.min(255, (num & 0x0000ff) + amount);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

init();
