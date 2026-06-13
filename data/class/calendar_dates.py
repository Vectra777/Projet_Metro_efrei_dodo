class calendar_dates:
    def __init__(self, service_id, date, exception_type):
        self.service_id = service_id
        self.date = date
        self.exception_type = exception_type

    def __str__(self):
        return f"Service ID: {self.service_id}, Date: {self.date}, Exception Type: {self.exception_type}"