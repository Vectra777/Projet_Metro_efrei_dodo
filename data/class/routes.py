class routes : 
    def __init__(self, route_id,agency_id,route_short_name,route_long_name,route_type, route_desc = None ,route_url = None ,route_color = None,route_text_color = None,route_sort_order = None):
        self.route_id = route_id
        self.agency_id = agency_id
        self.route_short_name = route_short_name
        self.route_long_name = route_long_name
        self.route_desc = route_desc
        self.route_type = route_type
        self.route_url = route_url
        self.route_color = route_color
        self.route_text_color = route_text_color
        self.route_sort_order = route_sort_order

    def __str__(self):
        return f"Route ID: {self.route_id}, Agency ID: {self.agency_id}, Short Name: {self.route_short_name}, Long Name: {self.route_long_name}, Description: {self.route_desc}, Type: {self.route_type}, URL: {self.route_url}, Color: {self.route_color}, Text Color: {self.route_text_color}, Sort Order: {self.route_sort_order}"