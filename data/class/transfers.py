class transfers: 
    def __init__(self, from_stop_id, to_stop_id, transfer_type, min_transfer_time=None):
        self.from_stop_id = from_stop_id
        self.to_stop_id = to_stop_id
        self.transfer_type = transfer_type
        self.min_transfer_time = min_transfer_time

    def __str__(self):
        return f"From Stop ID: {self.from_stop_id}, To Stop ID: {self.to_stop_id}, Transfer Type: {self.transfer_type}, Min Transfer Time: {self.min_transfer_time}"