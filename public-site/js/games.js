// Configuration for specific locations to match the design
const targetLocations = {
  North: [
    { display: "YISHUN", apiArea: "Yishun" },
    { display: "ADMIRALTY", apiArea: "Sembawang" }, // Using Sembawang as proxy for Admiralty
    { display: "WOODLANDS", apiArea: "Woodlands" },
  ],
  West: [
    { display: "JURONG", apiArea: "Jurong East" }, // Using Jurong East for generic Jurong
    { display: "LAKESIDE", apiArea: "Jurong West" }, // Using Jurong West for Lakeside
    { display: "BOON LAY", apiArea: "Boon Lay" },
    { display: "TUAS", apiArea: "Tuas" },
    { display: "CLEMENTI", apiArea: "Clementi" },
  ],
};

// Weather condition to icon mapping (Simple version)
function getWeatherIcon(forecast) {
  const lower = forecast.toLowerCase();
  if (lower.includes("thunder")) return "⛈️";
  if (lower.includes("rain") || lower.includes("shower")) return "🌧️";
  if (lower.includes("cloud")) return "☁️";
  if (lower.includes("fair") || lower.includes("sunny")) return "☀️";
  if (lower.includes("haze")) return "🌫️";
  return "🌤️";
}

function updateDateTime() {
  try {
    const now = new Date();
    
    // Format Date: SATURDAY 25 NOVEMBER 2025 (Singapore time)
    const dateOptions = { 
      weekday: "long", 
      day: "numeric", 
      month: "long", 
      year: "numeric", 
      timeZone: "Asia/Singapore" 
    };
    const dateString = now.toLocaleDateString("en-SG", dateOptions).toUpperCase();
    const dateElement = document.getElementById("current-date");
    if (dateElement) {
      dateElement.textContent = dateString;
    }

    // Get Singapore time using Intl.DateTimeFormat for reliable timezone conversion
    const singaporeFormatter = new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    
    const singaporeTimeParts = singaporeFormatter.formatToParts(now);
    let hours = "";
    let minutes = "";
    
    singaporeTimeParts.forEach(part => {
      if (part.type === "hour") hours = part.value.padStart(2, "0");
      if (part.type === "minute") minutes = part.value.padStart(2, "0");
    });
    
    const timeString = `${hours}:${minutes}`;
    
    const timeElement = document.getElementById("current-time");
    if (timeElement) {
      timeElement.textContent = timeString;
    }
  } catch (error) {
    console.error("Error updating date/time:", error);
    // Fallback: manually calculate Singapore time (UTC+8)
    try {
      const now = new Date();
      // Get UTC time
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      // Singapore is UTC+8 (8 hours = 8 * 60 * 60 * 1000 milliseconds)
      const singaporeTime = new Date(utcTime + (8 * 60 * 60 * 1000));
      
      const hours = String(singaporeTime.getUTCHours()).padStart(2, "0");
      const minutes = String(singaporeTime.getUTCMinutes()).padStart(2, "0");
      
      const timeElement = document.getElementById("current-time");
      if (timeElement) {
        timeElement.textContent = `${hours}:${minutes}`;
      }
    } catch (fallbackError) {
      console.error("Fallback time calculation failed:", fallbackError);
    }
  }
}

async function fetchWeatherData() {
  try {
    // 1. Fetch Current Temperature
    const tempResponse = await fetch("https://api.data.gov.sg/v1/environment/air-temperature");
    if (!tempResponse.ok) throw new Error("Temperature API failed");
    const tempData = await tempResponse.json();
    // Calculate average temp from all stations
    if (tempData.items && tempData.items[0] && tempData.items[0].readings) {
      const readings = tempData.items[0].readings;
      if (readings.length > 0) {
        const avgTemp = readings.reduce((acc, curr) => acc + curr.value, 0) / readings.length;
        document.getElementById("current-temp").textContent = `${Math.round(avgTemp)}°C`;
      }
    }

    // 2. Fetch 24-hour Forecast for general condition
    const forecast24Response = await fetch("https://api.data.gov.sg/v1/environment/24-hour-weather-forecast");
    if (!forecast24Response.ok) throw new Error("24-hour forecast API failed");
    const forecast24Data = await forecast24Response.json();
    if (forecast24Data.items && forecast24Data.items[0] && forecast24Data.items[0].general) {
      const generalForecast = forecast24Data.items[0].general.forecast;
      document.getElementById("current-condition").textContent = generalForecast.toUpperCase();
      document.getElementById("current-icon").textContent = getWeatherIcon(generalForecast);
    }

    // 3. Fetch 4-Day Forecast
    const forecast4DayResponse = await fetch("https://api.data.gov.sg/v1/environment/4-day-weather-forecast");
    if (!forecast4DayResponse.ok) throw new Error("4-day forecast API failed");
    const forecast4DayData = await forecast4DayResponse.json();
    if (!forecast4DayData.items || !forecast4DayData.items[0] || !forecast4DayData.items[0].forecasts) {
      throw new Error("Invalid 4-day forecast data");
    }
    const forecasts = forecast4DayData.items[0].forecasts;

    const forecastContainer = document.getElementById("forecast-container");
    // Keep the header
    forecastContainer.innerHTML = "<h2>NEXT 4 DAYS</h2>";

    forecasts.forEach((day) => {
      const date = new Date(day.date);
      const dayName = date.toLocaleDateString("en-SG", { weekday: "short" }).toUpperCase();
      const dayNum = String(date.getDate()).padStart(2, "0");
      const monthNum = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const dateStr = `${dayNum}/${monthNum}/${year}`;

      const item = document.createElement("div");
      item.className = "forecast-item";
      item.innerHTML = `
                <span class="day">${dayName}</span> <span class="date-small">${dateStr}</span>
                <p>${day.forecast}<br>${day.temperature.low} - ${day.temperature.high}°C</p>
            `;
      forecastContainer.appendChild(item);
    });

    // 4. Fetch 2-Hour Forecast for Regions
    const forecast2HourResponse = await fetch("https://api.data.gov.sg/v1/environment/2-hour-weather-forecast");
    if (!forecast2HourResponse.ok) throw new Error("2-hour forecast API failed");
    const forecast2HourData = await forecast2HourResponse.json();
    if (forecast2HourData.items && forecast2HourData.items[0] && forecast2HourData.items[0].forecasts) {
      const areaForecasts = forecast2HourData.items[0].forecasts;
      updateRegionReport("North", areaForecasts);
      updateRegionReport("West", areaForecasts);
      // You can add other regions here if you want to expand the UI
    }

  } catch (error) {
    console.error("Error fetching weather data:", error);
    document.getElementById("current-condition").textContent = "UNAVAILABLE";
    document.getElementById("current-temp").textContent = "--°C";
    document.getElementById("current-icon").textContent = "❌";
  }
}

function updateRegionReport(regionName, allForecasts) {
  const containerId = `region-${regionName.toLowerCase()}`;
  const container = document.getElementById(containerId);
  if (!container) return;

  const targets = targetLocations[regionName];
  if (!targets) return;

  let locationsHtml = "";
  let conditionsHtml = "";

  targets.forEach((target) => {
    // Find the forecast for the mapped API area
    const forecastData = allForecasts.find((f) => f.area === target.apiArea);

    // Use the display name from our config
    locationsHtml += `${target.display}<br>`;

    // If we found data, use it, otherwise show N/A
    if (forecastData) {
      conditionsHtml += `${forecastData.forecast.toUpperCase()}<br>`;
    } else {
      conditionsHtml += `N/A<br>`;
    }
  });

  const detailsDiv = container.querySelector(".report-details");
  detailsDiv.querySelector(".locations").innerHTML = locationsHtml;
  detailsDiv.querySelector(".conditions").innerHTML = conditionsHtml;
}

// Train service data is rendered server-side, no need to fetch on frontend

// Hide preloader when page is fully loaded
function hidePreloader() {
  const pageLoader = document.getElementById('page-loader');
  if (pageLoader) {
    pageLoader.style.display = 'none';
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  // Update immediately
  updateDateTime();
  
  // Train service status is already rendered from server, no need to fetch

  // Update time every minute
  setInterval(updateDateTime, 60000);
  
  // Fetch weather data and hide preloader when done
  // Wait at least 1.5 seconds to ensure preloader is visible
  const minDisplayTime = 1500;
  const startTime = Date.now();
  
  try {
    await fetchWeatherData();
  } catch (error) {
    console.error("Error loading weather data:", error);
  }
  
  // Calculate remaining time to meet minimum display duration
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, minDisplayTime - elapsed);
  
  setTimeout(() => {
    hidePreloader();
  }, remaining);
  
  // Update weather every 30 minutes
  setInterval(fetchWeatherData, 30 * 60000);
});

// Also update immediately when script loads (in case DOMContentLoaded already fired)
if (document.readyState === "loading") {
  // DOMContentLoaded has not fired yet
  document.addEventListener("DOMContentLoaded", updateDateTime);
} else {
  // DOMContentLoaded has already fired
  updateDateTime();
}

