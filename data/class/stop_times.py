class stop_times:
    def __init__(self, trip_id, arrival_time, departure_time, stop_id, stop_sequencepickup_type = None,drop_off_type = None, local_zone_id = None, stop_headsign = None, timepoint = None):
        self.trip_id = trip_id
        self.arrival_time = arrival_time
        self.departure_time = departure_time
        self.stop_id = stop_id
        self.stop_sequence = stop_sequencepickup_type
        self.drop_off_type = drop_off_type
        self.local_zone_id = local_zone_id
        self.stop_headsign = stop_headsign
        self.timepoint = timepoint

    def __str__(self):
        return f"Trip ID: {self.trip_id}, Arrival Time: {self.arrival_time}, Departure Time: {self.departure_time}, Stop ID: {self.stop_id}, Stop Sequence: {self.stop_sequence}, Pickup Type: {self.pickup_type}, Drop Off Type: {self.drop_off_type}, Local Zone ID: {self.local_zone_id}, Stop Headsign: {self.stop_headsign}, Timepoint: {self.timepoint}"