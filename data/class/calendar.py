class calendar: 
    def __init__(self, service_id, dayTab, start_date, end_date):
        self.service_id = service_id
        self.dayTab = dayTab
        self.start_date = start_date
        self.end_date = end_date

    def __str__(self):
        return f"Service ID: {self.service_id}, Day Tab: {self.dayTab}, Start Date: {self.start_date}, End Date: {self.end_date}"