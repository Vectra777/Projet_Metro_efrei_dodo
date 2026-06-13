 class stops: 
    def __init__(self, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, stop_code = None, stop_desc = None, stop_url = None, location_type=None,wheelchair_boarding=None, stop_timezone = None, level_id = None, platform_code = None):
        self.stop_id = stop_id
        self.stop_name = stop_name
        self.stop_lat = stop_lat
        self.stop_lon = stop_lon
        self.zone_id = zone_id
        self.parent_station = parent_station
        self.stop_code = stop_code
        self.stop_desc = stop_desc
        self.stop_url = stop_url
        self.location_type = location_type
        self.wheelchair_boarding = wheelchair_boarding
        self.stop_timezone = stop_timezone
        self.level_id = level_id
        self.platform_code = platform_code
    def __str__(self):
        return f"Stop ID: {self.stop_id}, Stop Name: {self.stop_name}, Stop Latitude: {self.stop_lat}, Stop Longitude: {self.stop_lon}, Zone ID: {self.zone_id}, Parent Station: {self.parent_station}, Stop Code: {self.stop_code}, Stop Description: {self.stop_desc}, Stop URL: {self.stop_url}, Location Type: {self.location_type}, Wheelchair Boarding: {self.wheelchair_boarding}, Stop Timezone: {self.stop_timezone}, Level ID: {self.level_id}, Platform Code: {self.platform_code}"