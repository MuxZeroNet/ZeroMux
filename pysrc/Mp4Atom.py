# coding: utf-8

import io
import struct

class Mp4Error(Exception):
    def __init__(self, *args,  **kwargs):
        Exception.__init__(self, *args, **kwargs)

class Mp4EndedError(Mp4Error):
    def __init__(self, *args,  **kwargs):
        Mp4Error.__init__(self, *args, **kwargs)

def Box(name, size):
    if len(name) != 4 or size < 0 or size > 0xFFFFFFFF:
        raise Mp4Error("Cannot make such box")

    return {
        "size": size,
        "name": name,
    }

def FullBox(name, size, version, flags):
    box = Box(name, size)
    return ToFullBox(box, version, flags)

def ToFullBox(box, version, flags):
    if version < 0 or version > 255:
        raise Mp4Error("Version range error")
    if len(flags) != 3:
        raise Mp4Error("Flags invalid length")

    box["version"] = version
    box["flags"] = flags

    return box

def IsFullBox(box):
    return ("version" in box and "flags" in box)

def BoxName(box):
    return box["name"]

def BoxSize(box):
    return box["size"]

def SetBoxSize(box, size):
    box["size"] = size

def BoxVersion(box):
    return box["version"]

def BoxFlags(box):
    return box["flags"]

def BoxContent(box):
    return box.get("content")

BOX_HEADER_LENGTH = 8
FULL_BOX_HEADER_LENGTH = 12

def AssignContent(box, content, reset_size=True):
    box["content"] = content

    if reset_size:
        increment = BOX_HEADER_LENGTH
        if IsFullBox(box):
            increment = FULL_BOX_HEADER_LENGTH
        SetBoxSize(box, len(content) + increment)

def ReadBoxHeader(file_info, full_box=False):
    size_bytes = file_info.read(4)
    name_bytes = file_info.read(4)
    if len(size_bytes) == 0:
        return None
    if len(size_bytes) < 4 or len(name_bytes) < 4:
        raise Mp4EndedError("Reached EOF")

    size = struct.unpack(">I", size_bytes)[0]

    if not full_box:
        return Box(name_bytes, size)

    else:
        version, flags = ReadVersionFlags(file_info)
        return FullBox(name_bytes, size, version, flags)

def ReadVersionFlags(file_info):
    version_flags = file_info.read(4)
    if len(version_flags) < 4:
        raise Mp4EndedError("Reached EOF")

    version, flags = struct.unpack(">B3s", version_flags)
    return (version, flags)

def FindOneBox(file_info, name, full_box=False):
    box = ReadBoxHeader(file_info)
    if not box:
        return None

    while BoxName(box) != name:
        # skip content
        file_info.seek(BoxSize(box) - BOX_HEADER_LENGTH, 1) # 1 == RELATIVE
        # read another box header
        box = ReadBoxHeader(file_info)
        if not box:
            return None

    content_length = BoxSize(box) - BOX_HEADER_LENGTH
    if full_box:
        content_length = BoxSize(box) - FULL_BOX_HEADER_LENGTH
        version, flags = ReadVersionFlags(file_info)
        ToFullBox(box, version, flags)

    content = file_info.read(content_length)
    if len(content) != content_length:
        raise Mp4Error("Reached EOF when reading box content")

    AssignContent(box, content, reset_size=False)
    return box

def FindByPath(file_info, path):
    box = None
    memory_stream = None

    path_parts = path.split(".")
    while len(path_parts) > 0:
        box_name = path_parts.pop(0)
        full_box = False
        if box_name.endswith("!"):
            box_name = box_name[0:4]
            full_box = True

        target_stream = memory_stream or file_info
        box = FindOneBox(target_stream, box_name, full_box)
        if not box:
            return None
        
        if memory_stream:
            memory_stream.close()
        memory_stream = io.BytesIO(BoxContent(box))

    memory_stream.close()
    return box



def PackBox(box):
    if BoxSize(box) < 4:
        raise Mp4Error("Cannot pack box whose size < 4")

    header = struct.pack(">I4s", BoxSize(box), BoxName(box))
    if IsFullBox(box):
        version_flags = struct.pack(">B3s", BoxVersion(box), BoxFlags(box))
        header += version_flags

    if BoxContent(box) == None or BoxSize(box) != len(header) + len(BoxContent(box)):
        raise Exception("Box content length + header length != box size")

    return header + BoxContent(box)
