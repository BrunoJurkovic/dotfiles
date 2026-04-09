local colors = require("colors")
local settings = require("settings")

local weather_cache = { text = "", last_fetch = 0 }

local calendar = sbar.add("item", "calendar", {
  position = "right",
  update_freq = 30,
  icon = { drawing = false },
  label = {
    font = { family = settings.font.text, style = "Medium", size = 12.0 },
    padding_left = 10,
    padding_right = 10,
  },
  background = {
    color = colors.bracket,
    corner_radius = settings.bracket.corner_radius,
    height = settings.bracket.height,
    drawing = true,
  },
  click_script = "open -a Calendar",
})

local function update_label()
  local datetime = os.date("%a %d %b · %I:%M %p")
  if weather_cache.text ~= "" then
    calendar:set({ label = { string = datetime .. " · " .. weather_cache.text } })
  else
    calendar:set({ label = { string = datetime } })
  end
end

local function fetch_weather()
  sbar.exec("curl -s 'wttr.in/?format=%c%t' 2>/dev/null | head -1 | sed 's/+//'", function(result)
    if result and result ~= "" and not result:find("Unknown") and not result:find("curl") then
      weather_cache.text = result:gsub("%s+$", "")
      weather_cache.last_fetch = os.time()
    end
    update_label()
  end)
end

calendar:subscribe({ "routine", "forced", "system_woke" }, function(env)
  -- Refresh weather every 30 minutes
  if os.time() - weather_cache.last_fetch > 1800 then
    fetch_weather()
  else
    update_label()
  end
end)

-- Initial weather fetch
fetch_weather()
