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

// Helper function to fetch with timeout
async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchWeatherData() {
  try {
    // Fetch all APIs in parallel with 5-second timeout for each
    const [tempResponse, forecast24Response, forecast4DayResponse, forecast2HourResponse] = await Promise.allSettled([
      fetchWithTimeout("https://api.data.gov.sg/v1/environment/air-temperature", 5000),
      fetchWithTimeout("https://api.data.gov.sg/v1/environment/24-hour-weather-forecast", 5000),
      fetchWithTimeout("https://api.data.gov.sg/v1/environment/4-day-weather-forecast", 5000),
      fetchWithTimeout("https://api.data.gov.sg/v1/environment/2-hour-weather-forecast", 5000)
    ]);

    // 1. Process Current Temperature
    if (tempResponse.status === 'fulfilled' && tempResponse.value.ok) {
      try {
        const tempData = await tempResponse.value.json();
        if (tempData.items && tempData.items[0] && tempData.items[0].readings) {
          const readings = tempData.items[0].readings;
          if (readings.length > 0) {
            const avgTemp = readings.reduce((acc, curr) => acc + curr.value, 0) / readings.length;
            document.getElementById("current-temp").textContent = `${Math.round(avgTemp)}°C`;
          }
        }
      } catch (e) {
        console.error("Error parsing temperature data:", e);
      }
    } else {
      console.warn("Temperature API failed or timed out");
      document.getElementById("current-temp").textContent = "--°C";
    }

    // 2. Process 24-hour Forecast
    if (forecast24Response.status === 'fulfilled' && forecast24Response.value.ok) {
      try {
        const forecast24Data = await forecast24Response.value.json();
        if (forecast24Data.items && forecast24Data.items[0] && forecast24Data.items[0].general) {
          const generalForecast = forecast24Data.items[0].general.forecast;
          document.getElementById("current-condition").textContent = generalForecast.toUpperCase();
          document.getElementById("current-icon").textContent = getWeatherIcon(generalForecast);
        }
      } catch (e) {
        console.error("Error parsing 24-hour forecast:", e);
      }
    } else {
      console.warn("24-hour forecast API failed or timed out");
      document.getElementById("current-condition").textContent = "UNAVAILABLE";
      document.getElementById("current-icon").textContent = "☁️";
    }

    // 3. Process 4-Day Forecast
    if (forecast4DayResponse.status === 'fulfilled' && forecast4DayResponse.value.ok) {
      try {
        const forecast4DayData = await forecast4DayResponse.value.json();
        if (forecast4DayData.items && forecast4DayData.items[0] && forecast4DayData.items[0].forecasts) {
          const forecasts = forecast4DayData.items[0].forecasts;
          const forecastContainer = document.getElementById("forecast-container");
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
        }
      } catch (e) {
        console.error("Error parsing 4-day forecast:", e);
      }
    } else {
      console.warn("4-day forecast API failed or timed out");
    }

    // 4. Process 2-Hour Forecast
    if (forecast2HourResponse.status === 'fulfilled' && forecast2HourResponse.value.ok) {
      try {
        const forecast2HourData = await forecast2HourResponse.value.json();
        if (forecast2HourData.items && forecast2HourData.items[0] && forecast2HourData.items[0].forecasts) {
          const areaForecasts = forecast2HourData.items[0].forecasts;
          updateRegionReport("North", areaForecasts);
          updateRegionReport("West", areaForecasts);
        }
      } catch (e) {
        console.error("Error parsing 2-hour forecast:", e);
      }
    } else {
      console.warn("2-hour forecast API failed or timed out");
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
  try {
    await fetchWeatherData();
  } catch (error) {
    console.error("Error loading weather data:", error);
  } finally {
    // Hide preloader immediately when data is loaded (or failed)
    hidePreloader();
  }
  
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

