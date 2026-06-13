class agency: 
    def __init__(self, agency__id, agency_name, agency_url, agency_timezone, agency_lang = None, agency_phone = None, agency_email = None):
        self.agency__id = agency__id
        self.agency_name = agency_name
        self.agency_url = agency_url
        self.agency_timezone = agency_timezone
        self.agency_lang = agency_lang
        self.agency_phone = agency_phone
        self.agency_email = agency_email
    
    def __str__(self):
        return f"Agency ID: {self.agency__id}, Name: {self.agency_name}, URL: {self.agency_url}, Timezone: {self.agency_timezone}, Language: {self.agency_lang}, Phone: {self.agency_phone}, Email: {self.agency_email}"
    