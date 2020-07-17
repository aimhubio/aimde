import os
from base64 import b64encode

from utils import get_module, ls_dir


class TFSummaryAdapter:
    event_accumulator = None

    @staticmethod
    def name_to_hash(log_file_name):
        return b64encode(log_file_name.encode('utf-8')).decode('utf-8')

    @classmethod
    def list_log_dir_paths(cls, root_path):
        """Returns list of directory names which contain `tfevents` file"""
        all_files = ls_dir([root_path])
        tfevent_files = filter(lambda f: 'tfevents' in f, all_files)
        tfevent_file_paths = set()
        for f in tfevent_files:
            path, _, _ = f.rpartition('/')
            tfevent_file_paths.add(path)
        return list(tfevent_file_paths)

    @classmethod
    def parse_params_from_name(cls, dir_path):
        pass

    def __init__(self, dir_path):
        self.dir_path = dir_path
        self.hash = None
        self.file_paths = []
        self.ea_list = []
        self.tags = set()

        if self.event_accumulator is None:
            self.event_accumulator = get_module(
                'tensorboard.backend.event_processing.event_accumulator')

        for file in os.listdir(dir_path):
            file_path = os.path.join(self.dir_path, file)
            if os.path.isfile(file_path) and 'tfevents' in file:
                self.file_paths.append(file_path)

        if len(self.file_paths) > 0:
            for file_path in self.file_paths:
                ea_inst = self.event_accumulator.EventAccumulator(
                    file_path,
                    size_guidance={
                        self.event_accumulator.SCALARS: 0,
                    })
                print(file_path)
                ea_inst.Reload()
                ea_tags = ea_inst.Tags().get('scalars') or []
                self.ea_list.append({
                    'eq': ea_inst,
                    'tags': ea_tags,
                })
                for t in ea_tags:
                    self.tags.add(t)

    def get_scalars(self, filter_tags):
        scalars = {}

        if len(self.ea_list) == 0 or self.tags == 0:
            return scalars

        # Get data
        for ea in self.ea_list:
            for filter_tag in filter_tags:
                filter_tag_match = None
                for ea_tag in ea['tags']:
                    if ea_tag == filter_tag \
                            or ea_tag.endswith('/{}'.format(filter_tag)):
                        filter_tag_match = ea_tag
                        break
                if filter_tag_match is not None:
                    records = ea['eq'].Scalars(filter_tag_match)
                    scalars.setdefault(filter_tag, {
                        'data': [],
                        'tag': {
                            'name': filter_tag_match,
                        },
                    })
                    for idx, r in enumerate(records):
                        scalars[filter_tag]['data'].append({
                            'step': idx,
                            'value': r.value,
                            'time': r.wall_time,
                            'local_step': r.step,
                            'epoch': None,
                        })

        # Set scalar properties
        for scalar in scalars.values():
            _, _, name = self.dir_path[1:].partition('/')
            scalar['name'] = name
            scalar['hash'] = self.name_to_hash(name)

            # Order data by step and remove duplications
            # seen_steps = set()
            # record_idx = 0
            # while record_idx < len(scalar['data']):
            #     record = scalar['data'][record_idx]
            #     if record['step'] not in seen_steps:
            #         seen_steps.add(record['step'])
            #         record_idx += 1
            #     else:
            #         del scalar['data'][record_idx]
            # scalar['data'] = sorted(scalar['data'], key=lambda r: r['step'])

            scalar['num_steps'] = len(scalar['data'])
            date = int(scalar['data'][0]['time']) if len(scalar['data']) else 0
            scalar['date'] = date
            scalar['msg'] = date
            scalar['source'] = 'tf_summary'

        return list(scalars.values())
