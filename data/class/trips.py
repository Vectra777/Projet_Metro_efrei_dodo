class trips: 
    def __init__(self, route_id, service_id, trip_id, shape_id, trip_headsign=None, direction_id=None, block_id=None, wheelchair_accessible=None, bikes_allowed=None):
        self.route_id = route_id
        self.service_id = service_id
        self.trip_id = trip_id
        self.trip_headsign = trip_headsign
        self.direction_id = direction_id
        self.block_id = block_id
        self.shape_id = shape_id
        self.wheelchair_accessible = wheelchair_accessible
        self.bikes_allowed = bikes_allowed

    def __str__(self):
        return f"Route ID: {self.route_id}, Service ID: {self.service_id}, Trip ID: {self.trip_id}, Trip Headsign: {self.trip_headsign}, Direction ID: {self.direction_id}, Block ID: {self.block_id}, Shape ID: {self.shape_id}" 