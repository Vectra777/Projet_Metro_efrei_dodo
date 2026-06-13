class stop_extensions:
    def __init__(self, object_id, object_system = None, object_code = None):
        self.object_id = object_id
        self.object_system = object_system
        self.object_code = object_code

    def __str__(self):
        return f"Object ID: {self.object_id}, Object System: {self.object_system}, Object Code: {self.object_code}"