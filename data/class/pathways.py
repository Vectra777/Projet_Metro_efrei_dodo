class pathways: 
    def __init__(self, pathways_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, length=None, traversal_time=None, stair_count=None, max_slope=None, min_width=None, signposted_as=None, reversed_signposted_as=None):
        self.pathways_id = pathways_id
        self.from_stop_id = from_stop_id
        self.to_stop_id = to_stop_id
        self.pathway_mode = pathway_mode
        self.is_bidirectional = is_bidirectional
        self.length = length
        self.traversal_time = traversal_time
        self.stair_count = stair_count
        self.max_slope = max_slope
        self.min_width = min_width
        self.signposted_as = signposted_as
        self.reversed_signposted_as = reversed_signposted_as