#!/usr/bin/env python2
# coding: utf-8

import sys
import os

if sys.version_info[0] != 2:
    file_name = __file__.replace("\\", "/").split("/")[-1]

    print("""
    You may have used or downloaded the wrong version of Python.


    You need:  [ Python 2.7 ]

    You are using: Python %s.%s.%s


    Press <Enter>, and I will try fixing it for you.

    If it doesn't work, try checking what Python you just downloaded.

    """ % sys.version_info[0:3])
    _ = input("<Press Enter>")
    if os.name == "nt":
        os.system("py -2 \"" + file_name + "\"")
    else:
        os.system("python2 \"" + file_name + "\"")

    exit()

print "ZeroMux Bundle"

import argparse

import BaseHTTPServer
import webbrowser
import urllib
import io

import Tkinter as tk
import tkFileDialog

import re
import json
import random

import json
import hashlib
import codecs

import datetime


sys.path.insert(0, "pysrc")
from FileChunks import *
from DataStructure import *
from AbstractRW import *


class Backend(BaseHTTPServer.BaseHTTPRequestHandler):
    state_refuse_choose_file = False
    selected_file = ""
    selected_vpath = ""
    token_list = set()
    uploaded_files = {}

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

    def do_GET(self):
        requested_path = self.path.split("?")[0]

        if requested_path == "/":
            self.HandleHomeRedirect()
        elif requested_path == "/zeromux.py":
            self.HandleHome()
        elif requested_path == "/loader/":
            self.HandleLoaderRedirect(self.path)
        elif requested_path == "/loader/loader.py":
            self.HandleLoaderPage()

        elif requested_path == "/chooseFile":
            self.CheckToken(self.path, lambda: self.HandleUpload(self.path))
        elif requested_path == "/showSelected":
            self.HandleShowFile()
        elif requested_path == "/confirmUpload":
            self.CheckToken(self.path, lambda: self.HandleConfirmUpload(self.path))
        elif requested_path == "/showUploaded":
            self.HandleShowUploaded();

        elif requested_path == "/rename":
            self.CheckToken(self.path, lambda: self.HandleRename(self.path))
        elif requested_path == "/move":
            self.CheckToken(self.path, lambda: self.HandleMove(self.path))
        elif requested_path == "/delete":
            self.CheckToken(self.path, lambda: self.HandleDelete(self.path))
        elif requested_path == "/newFolder":
            self.CheckToken(self.path, lambda: self.HandleNewFolder(self.path))


        elif requested_path == "/findAllFiles":
            self.CheckToken(self.path, lambda: self.HandleOpenFolder("/?file=" + ROOT_FOLDER_ID))
        elif requested_path == "/openFolder":
            self.CheckToken(self.path, lambda: self.HandleOpenFolder(self.path))

        elif requested_path == "/getToken":
            self.HandleGetToken()

        elif requested_path == "/debug":
            self.HandleDebug()

        else:
            self.ServeStaticFile(requested_path)

    def HandleHomeRedirect(self):
        self.SendRedirection("/zeromux.py")

    def HandleLoaderRedirect(self, path_header):
        requested_path = path_header.split("?")[0]
        params = path_header[len(requested_path):]
        self.SendRedirection("/loader/loader.py" + params)

    def HandleHome(self):
        self.ServeStaticFile("/zeromux.html")

    def HandleLoaderPage(self):
        self.ServeStaticFile("/loader/index.html")

    def HandleGetToken(self):
        def GenToken():
            return os.urandom(32).encode('base64') \
                .replace('+', 'M').replace('/', 'u').replace('=', 'X').replace('\n', 'x')

        token = GenToken()
        while token in Backend.token_list:
            token = GenToken()

        Backend.token_list.add(token)

        # respond
        self.SendNormalHeaders("application/json")
        response_json = json.dumps({"status": True, "token": token})
        self.wfile.write(response_json)

    def CheckToken(self, path_header, func):
        if "?" not in path_header:
            self.ServeErrorPage("No queries.")
            return

        if len(Backend.token_list) == 0:
            self.ServeErrorPage("Invalid token.")
            return

        query_list = path_header.split("?")[1].split("&")
        token_key = "token="
        token_values = [x[len(token_key):] for x in query_list if x.startswith(token_key)]

        if len(token_values) != 1:
            self.ServeErrorPage("?token=")
            return

        token = token_values[0]
        if len(token) < 5 or token not in Backend.token_list:
            self.ServeErrorPage("Invalid token.")
            return

        Backend.token_list.remove(token)
        func()

    def ServeErrorPage(self, message=""):
        self.SendErrorHeaders()
        self.wfile.write("Bad Request! " + message)


    def ShowFileDialog(self):
        # show file dialog
        root = tk.Tk()
        root.wm_title("ZeroMux")

        w = tk.Label(root, text="Please, select your file.", \
            padx=20, pady=20, font=("Arial", 12))
        w.pack()

        root.lift()
        root.attributes('-topmost', True)

        file_path = tkFileDialog.askopenfilename()
        root.withdraw()

        return file_path

    def HandleUpload(self, path_header):
        print("self.state_refuse_upload", Backend.state_refuse_choose_file)

        if Backend.state_refuse_choose_file:
            self.ServeErrorPage("Duplicated requests.")
            return

        # Backend.state_refuse_choose_file = True

        file_path = self.ShowFileDialog()

        if file_path:
            Backend.selected_file = file_path

        # determine virtual path
        path_hint = GetParam(path_header, "path=")
        if not path_hint:
            # No path was specified. Use root path
            path_hint = C_DRIVE_SLASH

        Backend.selected_vpath = "/".join(SepPathHint(path_hint))

        # respond
        self.SendNormalHeaders("application/json")
        self.wfile.write(json.dumps({
            "status": True,
            "filePath": Backend.selected_file,
            "virtualDir": Backend.selected_vpath,
        }))

        Backend.state_refuse_choose_file = False

    def HandleShowFile(self):
        json_response = {"status": True, "detail": "notAvailable"}

        if not Backend.state_refuse_choose_file:
            stripped_file_path = Backend.selected_file.strip()
            if stripped_file_path and os.path.isfile(stripped_file_path):
                json_response["detail"] = "selected"
                json_response["filePath"] = stripped_file_path
            else:
                json_response["strippedFilePath"] = stripped_file_path

        self.SendNormalHeaders("application/json")
        self.wfile.write(json.dumps(json_response))

    def HandleConfirmUpload(self, path_header):
        session_token = GetParam(path_header, "token=")
        given_file_name = GetParam(path_header, "rename=")
        file_path = Backend.selected_file

        path_hint = Backend.selected_vpath
        real_folder_ref = FindFolderByPath(path_hint, global_root_folder_content, global_all_folder_ids)
        print "real_folder_ref", real_folder_ref

        resp_status = False
        resp_message = ""

        if not os.path.isfile(file_path):
            resp_status = False
            resp_message = "File not found"

        elif real_folder_ref == None:
            resp_status = False
            resp_message = "Folder not found"
        else:
            # spilt file and create new file_info
            status, instance = HandleFileInput( \
                file_path, given_file_name, given_file_name, \
                FileListKeys(global_file_list)
            )

            resp_status = status

            if not status:
                resp_message = instance
            else:
                print instance
                # change global file list, global folder list, all folder ids
                AddNewFile(instance, real_folder_ref, global_file_list, global_all_folder_ids)
                # save list.json
                SaveListJson()
                # clear selected file
                Backend.selected_file = ""
                # resp message
                resp_message = FileId(instance)
                # add to uploaded file list
                Backend.uploaded_files[session_token] = resp_message

        # respond
        self.StatusResp(resp_status, resp_message)


    def HandleShowUploaded(self):
        self.StatusResp(True, Backend.uploaded_files)


    def HandleNewFolder(self, path_header):
        resp_status, resp_message = False, ""

        path_hint = GetParam(path_header, "in=")
        folder_name = GetParam(path_header, "name=")
        if not path_hint or not folder_name:
            resp_status, resp_message = False, "No enough params"

        else:
            in_folder = FindFolderByPath(path_hint, global_root_folder_content, global_all_folder_ids)
            if in_folder == None:
                resp_status, resp_message = False, "Folder not found"

            else:
                new_folder_id = GenerateNewUniqueId('folder', global_all_folder_ids)
                folder_info = ConstructFolderInfo(new_folder_id, folder_name, path_hint)
                AddNewFolder(folder_info, in_folder, global_all_folder_ids)

                SaveListJson()

                resp_status, resp_message = True, new_folder_id


        # respond
        self.StatusResp(resp_status, resp_message)

    def HandleRename(self, path_header):
        item_type = GetParam(path_header, "type=")
        path = GetParam(path_header, "path=")
        new_name = GetParam(path_header, "name=")

        resp_status, resp_message = False, ""

        if not item_type or item_type not in ('file', 'folder'):
            resp_status, resp_message = False, "Unknown type"
        elif not path:
            resp_status, resp_message = False, "No path specified"
        elif not new_name or not new_name.strip():
            resp_status, resp_message = False, "Empty name"

        else:
            if item_type == 'file':
                sep_path = SepPathHint(path)
                if len(sep_path) == 0:
                    self.StatusResp(False, "Invalid path")
                    return

                temp_file_info = ConstructFileInfo(sep_path[-1])

                if not FileExistsById(temp_file_info, global_file_list):
                    resp_status, resp_message = False, "File not found"
                else:
                    RenameFile(temp_file_info, new_name, global_file_list)
                    SaveListJson()
                    resp_status, resp_message = True, new_name

            elif item_type == 'folder':
                reference = FindFolderByPath(path, global_root_folder_content, global_all_folder_ids)
                if not reference:
                    resp_status, resp_message = False, "Folder not found"
                else:
                    RenameFolder(path, new_name, global_root_folder_content, global_all_folder_ids)
                    SaveListJson()
                    resp_status, resp_message = True, new_name

        # respond
        self.StatusResp(resp_status, resp_message)

    def HandleMove(self, path_header):
        item_type = GetParam(path_header, "type=")
        path = GetParam(path_header, "path=")
        to_dir_path = GetParam(path_header, "to=")

        if not all([item_type, path, to_dir_path]):
            self.StatusResp(False, "No enough params")
            return

        if not item_type in ('file', 'folder'):
            self.StatusResp(False, "Invalid item type")
            return

        existing_ids = FileListKeys(global_file_list) if item_type == 'file' else \
                       global_all_folder_ids

        path_list = path.split("|")
        files_moved = 0
        try:
            for single_path in path_list:
                MoveItem(item_type, single_path, to_dir_path, \
                    global_root_folder_content, global_all_folder_ids, existing_ids)
                files_moved = files_moved + 1

            if files_moved > 0:
                SaveListJson()

            self.StatusResp(True, to_dir_path)

        except AbsException, e:
            print "Got an AbsException:", e
            if files_moved > 0:
                SaveListJson()
            self.StatusResp(False, e.message)

        print "Moved %s item%s" % (str(files_moved), ("s" if files_moved > 1 else ""))


    def HandleDelete(self, path_header):
        path_param = GetParam(path_header, "path=")
        if not path_param:
            self.StatusResp(False, "No enough params")
            return

        path_list = path_param.strip().split("|")
        items_deleted = 0

        status, msg = True, "Done"

        try:
            for item_path in path_list:
                # delete from list.json
                json_list = DeleteItem(item_path, \
                    global_root_folder_content, global_file_list, global_all_folder_ids)

                items_deleted = items_deleted + 1

                # delete form /files/ folder
                for file_json, file_id in json_list:
                    DeleteFileJsonFolder(file_json, file_id, \
                        GetLoaderFolder() + "/files/", GetTrashFolder())



        except AbsException, e:
            status, msg = False, str(e)
            print "Got an AbsException:", e

        if items_deleted > 0:
            SaveListJson()
            print "Deleted " + str(items_deleted) + " item" + ("s" if items_deleted > 1 else "")

        self.StatusResp(status, msg)


    def HandleOpenFolder(self, path_header):
        file_id = GetParam(path_header, "file=")
        if not file_id:
            self.StatusResp(False, "File ID?")
            return


        real_folder = GetLoaderFolder() + "/files/"

        if not file_id == ROOT_FOLDER_ID:
            ref = FindFile(ConstructFileInfo(file_id), global_file_list)
            if not ref:
                self.StatusResp(False, "Cannot find this file.")
                return
            real_folder = GetLoaderFolder() + "/" + os.path.split(FileJson(ref))[0]

        real_folder = real_folder.strip()

        self.StatusResp(True, "...")

        webbrowser.open(real_folder)


    def HandleDebug(self):
        resp = {}
        resp["global_file_list"] = global_file_list
        resp["global_root_folder_content"] = global_root_folder_content
        resp["global file IDs"] = global_file_list.keys()
        resp["global_all_folder_ids"] = list(global_all_folder_ids)

        resp["state_refuse_choose_file"] = Backend.state_refuse_choose_file
        resp["selected_file"] = Backend.selected_file
        resp["selected_vpath"] = Backend.selected_vpath
        resp["uploaded_files"] = Backend.uploaded_files
        resp["token list length"] = len(Backend.token_list)

        self.SendNormalHeaders("application/json")
        for key in resp:
            indent = 2 if type(resp[key]) == dict else None

            self.wfile.write(json.dumps( {key: resp[key]}, indent=indent ))
            self.wfile.write("\r\n\r\n")


    def StatusResp(self, resp_status, resp_message):
        self.SendNormalHeaders("application/json")
        self.wfile.write(json.dumps({
            "status": resp_status,
            "message": resp_message
        }))

    def ServeStaticFile(self, requested_path):
        decoded_path = "./" + requested_path.replace("\\", "/")
        decoded_path = urllib.unquote(decoded_path).decode('utf8')
        clean_path = os.path.normpath(decoded_path).replace("\\", "/")
        # check .. " and '
        if "/.." in clean_path or "../" in clean_path \
        or '"' in clean_path or clean_path.startswith(".."):
            self.SendErrorHeaders()
            self.wfile.write("Access Denied")
            return

        # check if we are accessing the current path
        root_path = GetRootPath()
        file_path = os.path.join(root_path, clean_path)

        if not root_path.endswith(os.path.sep):
            root_path = root_path + os.path.sep

        if not file_path.startswith(root_path):
            self.SendErrorHeaders()
            self.wfile.write("Access Denied")
            return

        print(root_path, clean_path, file_path)

        # find file
        if not os.path.isfile(file_path):
            self.SendErrorHeaders()
            self.wfile.write("File Not Found")
            return

        static_file = io.open(file_path, 'rb')

        self.SendNormalHeaders( ChooseContentType(os.path.splitext(file_path)[1]) )
        self.wfile.write(static_file.read())
        static_file.close()

    def SendNormalHeaders(self, content_type="text/html"):
        self.send_response(200)
        self._SendUsefulHeaders(content_type)

    def SendErrorHeaders(self, content_type="text/html"):
        self.send_response(404)
        self._SendUsefulHeaders(content_type)

    def SendRedirection(self, location):
        self.send_response(307)
        self.send_header("Location", location)
        self.end_headers()

    def _SendUsefulHeaders(self, content_type):
        self.send_header("Content-type", content_type)
        self.send_header("Server", "ZeroMux Configuration Wizard")
        self.end_headers()


def GetRootPath():
    p = os.path.normpath(os.path.dirname(os.path.abspath(__file__)) + "/")
    return p.decode(sys.getfilesystemencoding())

def GetLoaderFolder():
    return GetRootPath() + "/loader/"

def GetListJsonPath():
    return GetLoaderFolder() + "files/list.json"

def GetTrashFolder():
    return GetRootPath() + "/trash/"

def MakeFilesFolder():
    files_folder = GetLoaderFolder() + "/files/"
    if not os.path.isdir(files_folder):
        os.mkdir(files_folder)
    return files_folder

def ChooseContentType(ext):
    x = ext.lower().strip()
    ext_type = {".css": "text/css", ".htm": "text/html", ".html": "text/html",
    ".txt": "text/plain", ".js": "application/javascript", ".json": "application/json",
    ".pdf": "application/pdf", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
    ".png": "image/png", ".tiff": "image/tiff", ".gif": "image/gif",
    ".svg": "image/svg+xml", ".bmp": "image/bmp", ".mp4": "video/mp4", ".webm": "video/webm"}

    if ext_type.has_key(x):
        return ext_type[x]
    else:
        return ""

def SplitQueries(path_header):
    if "?" not in path_header:
        return []

    query_list = path_header.split("?")[1].split("&")
    return query_list

def GetParam(path_header, param_name):
    queries = SplitQueries(path_header)
    params = [x[len(param_name):] for x in queries if x.startswith(param_name)]
    if len(params) == 0:
        return None
    else:
        return urllib.unquote(params[0]).decode('utf8')


def HandleFileInput(file_path, given_file_name, folder_name, existing_ids):
    loader_folder = GetLoaderFolder()
    if not os.path.isdir(loader_folder):
        return (False, "Loader folder not found")
    if not os.path.isfile(file_path):
        return (False, "File not found")
    if existing_ids == None:
        raise Exception("Must specify existing IDs")

    if given_file_name == None:
        given_file_name = "No Name"

    # the "files/" folder
    files_folder = MakeFilesFolder()

    # use split to get real file name
    real_file_name = os.path.split(file_path)[1]
    # save to folder
    safe_folder_name = CorrectFolderName(folder_name, files_folder, real_file_name)
    save_to_folder = files_folder + "/" + safe_folder_name
    if os.path.exists(save_to_folder):
        return (False, "Failed to assign folder name")

    # start splitting file, writing file.json
    ideal_chunk_size = ChooseChunkSize(os.path.getsize(file_path))
    os.mkdir(save_to_folder)
    SplitFile(file_path, save_to_folder, "files/" + safe_folder_name, given_file_name, ideal_chunk_size)

    # return a new file_info reference
    new_file_id = GenerateNewUniqueId('file', existing_ids)

    file_json = "files/" + safe_folder_name + "/file.json"

    new_file_info = ConstructFileInfo(new_file_id, given_file_name, file_json)
    return (True, new_file_info)



FlagFirstRunModified = False

def SaveListJson():
    to_write = MakeListJson(global_file_list, global_root_folder_content)

    print "Updating", GetListJsonPath(), "......"

    files_folder = MakeFilesFolder()
    file_stream = io.open(GetListJsonPath(), 'w', encoding='utf-8')
    file_stream.write(unicode(json.dumps(to_write)))

    file_stream.flush()
    os.fsync(file_stream)
    file_stream.close()

    SaveFirstRunJs()

def SaveFirstRunJs():
    global FlagFirstRunModified

    if FlagFirstRunModified:
        return

    print "Updating first-run.js ......"

    files_folder = MakeFilesFolder()

    first_run_js = files_folder + "/first-run.js"

    js_content = """_BUNDLE_FIRST_RUN = false; _BUNDLE_LAST_MODIFIED = '%s';
                 """ % datetime.date.today().strftime("%Y-%m-%d 08:00")
    js_content = js_content.strip()

    js_stream = io.open(first_run_js, 'w', encoding='utf-8')
    js_stream.write(unicode(js_content))

    js_stream.flush()
    os.fsync(js_stream)
    js_stream.close()

    FlagFirstRunModified = True



def ServerForever():
    host_name = '127.0.0.1'
    port_number = 18905
    httpd = BaseHTTPServer.HTTPServer((host_name, port_number), Backend)

    print("Server Starts - %s:%s" % (host_name, port_number))
    webbrowser.open_new_tab("http://" + host_name + ":" + str(port_number) + "/");

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

    print("Server Stops - %s:%s" % (host_name, port_number))




global_file_list = None
global_root_folder_content = None
global_all_folder_ids = None

def Main():
    global global_file_list
    global global_root_folder_content
    global global_all_folder_ids

    global_all_folder_ids = set()

    list_json_path = GetListJsonPath()
    if not os.path.isfile(list_json_path):
        # list.json does not exist
        global_file_list = ReadRawFileList([])
        global_root_folder_content = ReadRawFolderContent([], _all_folder_id=global_all_folder_ids)
    else:
        # read list.json
        file_stream = io.open(list_json_path, 'r', encoding='utf-8')
        json_content = file_stream.read()
        file_stream.close()

        f, r = ReadRawListJson(json_content)
        if f == None or r == None:
            print "problematic list.json"
            _ = raw_input()
            exit()

        global_file_list = ReadRawFileList(f)
        global_root_folder_content = ReadRawFolderContent(r, _all_folder_id=global_all_folder_ids)

    ServerForever()


def CliMain(input_file, out_folder, size_kb, rel_path, friendly_name):
    if not os.path.isfile(input_file):
        raise Exception("Input File does not exist.")
    if not os.path.isdir(out_folder):
        raise Exception("Out Folder does not exist.")
    if size_kb != None:
        if size_kb <= 1:
            raise Exception("Chunk size is too small.")
        if size_kb > 10000:
            raise Exception("Chunk size is too large.")

    size_bytes = 0
    if size_kb:
        size_bytes = size_kb * 1024
    else:
        size_bytes = ChooseChunkSize(os.path.getsize(input_file))

    chosen_folder_name = ""
    if not rel_path:
        input_file_name = os.path.basename(input_file)
        chosen_folder_name = CorrectFolderName(input_file_name, out_folder, input_file_name)
        rel_path = "files/" + chosen_folder_name
    else:
        rel_path = rel_path.replace("\\", "/").strip()
        if rel_path.endswith("/"):
            rel_path = rel_path[0:-1]
        chosen_folder_name = os.path.basename(rel_path)

    chunk_folder = out_folder + "/" + chosen_folder_name
    if os.path.exists(chunk_folder):
        raise Exception("Failed to assign chunk folder name.")

    if not friendly_name:
        friendly_name = os.path.basename(input_file)

    print "Using arguments:\n" + \
        "Input file: " + input_file + "\n" + \
        "Output directory for chunks: " + chunk_folder + "/" + "\n" + \
        "Chunk size: " + str(1.0*size_bytes/1024) + "KB" + "\n" + \
        "Relative path: " + rel_path + "\n" + \
        "Friendly name: " + friendly_name

    os.mkdir(chunk_folder)
    SplitFile(input_file, chunk_folder, rel_path, friendly_name, size_bytes)

    print "Done."


if __name__ != "__main__":
    pass
elif len(sys.argv) == 1:
    Main()
else:
    parser = argparse.ArgumentParser(formatter_class=argparse.RawDescriptionHelpFormatter, \
        description="ZeroMux Configuration Wizard", \
        epilog="""_______
Example: Suppose you have a 01.mp4 in your My Documents folder.
         You want to slice it into 500kb chunks,
         save these chunks to E:\\MySite\\loader\\files\\yosuga_no_sora\\
         and have this friendly name "Yosuga no Sora.mp4" displayed.
         You type:

         wizard.py -i \"D:\\My Documents\\01.mp4\"
                   -out_dir \"E:\\MySite\\loader\\files\"
                   -chunk_size 500
                   -rel_path \"files/yosuga_no_sora\"
                   -name \"Yosuga no Sora.mp4\"
    """)

    parser.add_argument("-i", action="store", dest="input", help="file to split")
    parser.add_argument("-out_dir", action="store", dest="folder", \
        help="""output directory. Note that a new folder will be created
        in the specified directory to store the chunks.""")

    parser.add_argument("-chunk_size", action="store", dest="size_kb", type=int, \
        help="""[optional] chunk size in KB.
        If not specified, a reasonable value will be calculated and chosen.""")

    parser.add_argument("-rel_path", action="store", dest="rel_path", \
        help="""[optional] relative folder path with respect to __file loading page__.
        (e.g. http://site.com/pathto/loader/files/big_file/*.dat => -rel_path \"files/big_file\")
        Specifying rel_path will also change the name of the new folder created.""")
    parser.add_argument("-name", action="store", dest="name", \
        help="[optional] specify a friendly file name to be displayed")

    args = parser.parse_args()

    CliMain(args.input, args.folder, args.size_kb, args.rel_path, args.name)
