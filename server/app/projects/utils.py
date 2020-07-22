import os
import json

from file_read_backwards import FileReadBackwards


def get_branch_commits(branch_path):
    commits = {}
    for c in os.listdir(branch_path):
        if os.path.isdir(os.path.join(branch_path, c)) and c != 'index':
            commit_config_file_path = os.path.join(branch_path, c,
                                                   'config.json')
            try:
                with open(commit_config_file_path, 'r') as commit_config_file:
                    commit_config = json.loads(commit_config_file.read())
            except:
                commit_config = {}
            commits[c] = commit_config
    return commits


def get_dir_size(start_path):
    total_size = 0

    for dir_path, dir_names, file_names in os.walk(start_path):
        for f in file_names:
            fp = os.path.join(dir_path, f)
            # skip if it is symbolic link
            if not os.path.islink(fp):
                total_size += os.path.getsize(fp)

    return total_size


def read_artifact_log(file_path, limit=-1):
    if not os.path.isfile(file_path):
        return []

    content = []
    try:
        with FileReadBackwards(file_path, encoding='utf-8') as file:
            line_index = 0
            for l in file:
                if limit == -1 or line_index <= limit:
                    content = [l] + content

                if limit != -1:
                    line_index += 1
    except:
        pass

    return content
