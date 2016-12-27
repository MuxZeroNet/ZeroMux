#!/usr/bin/env python2
# coding: utf-8

import sys
import os


import urllib
import io


import re
import json
import random

import json
import hashlib
import codecs


from DataStructure import *


class AbsException(Exception):
    def __init__(self, *args,  **kwargs):
        Exception.__init__(self, *args, **kwargs)


# manipulating file_info and folder_content
def AddNewFile(file_info, in_folder, file_list, all_folder_id):
    if FileExistsById(file_info, file_list):
        raise AbsException("File ID already exists")
    if not FolderExistsById(in_folder, all_folder_id):
        raise AbsException("Folder does not exist")

    # add to file_list
    file_id = FileId(file_info)
    file_list[file_id] = file_info

    # get folder content reference
    content_of_in_folder = FolderContent(in_folder, correct_type=True)

    # does content_of_in_folder have the file ID?
    if file_id in content_of_in_folder:
        raise AbsException("FilePointer: File ID already exists in curr dir")

    # add new file pointer to folder content
    content_of_in_folder[file_id] = ConstructFilePointer(file_id)

    # modifies [file_list, folder_content]

def AddNewFolder(folder_info, in_folder, all_folder_id):
    if not FolderExistsById(in_folder, all_folder_id):
        raise AbsException("in_folder does not exist")
    if FolderExistsById(folder_info, all_folder_id):
        raise AbsException("folder_info already exists")

    # get the real reference
    content_of_in_folder = FolderContent(in_folder, correct_type=True)
    folder_id = FolderId(folder_info)

    if folder_id in content_of_in_folder:
        raise AbsException("Add new folder: Folder ID already exist in curr dir")
    if FolderContent(folder_info):
        raise AbsException("Add new folder: folder is not empty")

    # add new folder to in_folder
    content_of_in_folder[folder_id] = folder_info

    # add folder_id to all_folder_id
    all_folder_id.add(folder_id)

    # modifies folder_content, all_folder_id

def RenameFile(file_info, new_name, file_list):
    if not FileExistsById(file_info, file_list):
        raise AbsException("Rename: file does not exist")

    real_file_ref = FindFile(file_info, file_list)
    SetFileName(real_file_ref, new_name)

    # modifies file_list

def RenameFolder(path, new_name, root_folder_content, all_folder_id):
    real_reference = FindFolderByPath(path, root_folder_content, all_folder_id)
    if not real_reference:
        raise AbsException("Rename: folder does not exist")

    SetFolderName(real_reference, new_name)
    # modifies root_folder_content

def MoveItem(data_type, path, to_dir_path, root_folder_content, all_folder_id, existing_ids):
    if data_type not in ('file', 'folder'):
        raise AbsException("Invalid data type")

    parent_folder_path, item_id = SepPathAndName(path)
    if not parent_folder_path or not item_id:
        raise AbsException("Invalid path")

    parent_of_to_dir, to_dir_id = SepPathAndName(to_dir_path, allow_root=True)
    if not to_dir_id:
        raise AbsException("Invalid dest path")

    if not item_id in existing_ids:
        raise AbsException("file / folder does not exist")

    if not FolderExistsById(ConstructFolderInfo(to_dir_id), all_folder_id):
        raise AbsException("Dest folder does not exist")



    # get dest folder ref
    to_dir_ref = FindFolderByPath(to_dir_path, root_folder_content)
    if not to_dir_ref:
        raise AbsException("Dest folder cannot be found, according to path")
    to_dir_content = FolderContent(to_dir_ref)

    # get file pointer's parent / src folder's parent ref
    parent_folder_ref = FindFolderByPath(parent_folder_path, root_folder_content)
    if not parent_folder_ref:
        raise AbsException("File pointer's / source folder's parent does not exist")
    parent_folder_content = FolderContent(parent_folder_ref)

    # get real file pointer / folder ref
    real_item_ref = SelectItemInContent(parent_folder_content, item_id)

    if not real_item_ref:
        raise AbsException("Specified file / folder cannot be found")



    if data_type == 'folder' and item_id in SepPathHint(to_dir_path):
        raise AbsException("You cannot move the folder here!")

    if parent_folder_path == "/".join(SepPathHint(to_dir_path)):
        raise AbsException("Same folder.")



    # change pathHint
    if data_type == 'folder':
        SetFolderPathHint(real_item_ref, to_dir_path)

    # reassign this ref to dest folder
    ReassignItemInContent(to_dir_content, item_id, real_item_ref)
    # remove from source folder
    ReassignItemInContent(parent_folder_content, item_id, None)
    DeleteItemInContent(parent_folder_content, item_id)
    # modifies folder_content


# def CopyFile(file_pointer, to_folder, new_name, folder_content):
#     # modifies folder_content
#     pass

def DeleteItem(path, root_folder_content, file_list, all_folder_id):
    parent, item_id = SepPathAndName(path)
    if not parent or not item_id:
        raise AbsException("Invalid path. Are you trying to delete C: ?")

    if item_id not in all_folder_id:
        if item_id not in FileListKeys(file_list):
            raise AbsException("Specified file / folder cannot be found")

    parent_folder_ref = FindFolderByPath(parent, root_folder_content, all_folder_id)
    if not parent_folder_ref:
        raise AbsException("Parent folder cannot be found")
    parent_folder_content = FolderContent(parent_folder_ref)

    real_item_ref = SelectItemInContent(parent_folder_content, item_id)
    if not real_item_ref:
        raise AbsException("Specified file / folder cannot be found (problematic path)")



    pointers_to_delete = []
    folder_ids_to_delete = []

    if IsFilePointer(real_item_ref):
        # deleting a file
        pointers_to_delete.append(real_item_ref)
    elif IsFolderInfo(real_item_ref):
        # deleting a folder
        folder_ids_to_delete.append(FolderId(real_item_ref))

        pointers, dir_ids = FindAllFilePointersIn(FolderContent(real_item_ref))
        for pointer in pointers:
            pointers_to_delete.append(pointer)
        for dir_id in dir_ids:
            folder_ids_to_delete.append(dir_id)

    else:
        raise AbsException("Unknown item type")


    file_json_list = []

    # delete from file list
    for pointer in pointers_to_delete:
        print "Deleting file " + PointerTarget(pointer)
        f_json = DeleteFromFileList(pointer, file_list)
        file_json_list.append( (f_json, PointerTarget(pointer)) )

    # delete from directory tree
    DeleteItemInContent(parent_folder_content, item_id)

    # delete from all folder ids
    for dir_id in folder_ids_to_delete:
        print "Deleting folder " + dir_id
        DeleteFolderFromList(all_folder_id, dir_id)


    return file_json_list

def DeleteFromFileList(file_pointer, file_list):
    file_info = FindFile(file_pointer, file_list)
    if not file_info:
        raise AbsException("File does not exist in file list")

    file_json = FileJson(file_info)

    DeleteFileFromList(file_list, PointerTarget(file_pointer))

    return file_json
