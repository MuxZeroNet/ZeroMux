# ZeroMux Bundle
ZeroMux is a file sharing toolkit and site builder for [ZeroNet](https://zeronet.io). ZeroMux is the software that will make ZeroNet into a file sharing and media streaming network. It pushes ZeroNet's limit of handling big files by breaking big files into small chunks. Video files are converted into streaming friendly format and piped into HTML media elements, using [Media Source Extensions API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) and a built-in MP4 multiplexer.

## Getting Started
1. Download this repo, or if you prefer, get the pack at [ZeroMux Blog on ZeroNet](http://127.0.0.1:43110/1CiDoBP8RiWziqiBGEd8tQMy66A6fmnw2V/big/bundle/)
2. Unpack and run `wizard.py`
3. After you made changes to your file list, put the `loader` folder onto your site, or if you prefer, simply make a symbolic link:

    `ZeroMux/loader -> data/1YourSite/loader`
4. Sign and publish. Tell your friends to come visit your site.
5. For instructions of how to configure your ZeroNet site, refer to [ZeroMux Docs on ZeroNet](http://127.0.0.1:43110/1CiDoBP8RiWziqiBGEd8tQMy66A6fmnw2V/big/docs/gentle-intro/) and read more about it.

## Video Streaming
1. Upload a properly encoded, **non-fragmented** MP4 file.
2. Hack the source code of [example-player.html](loader/__example-player__.html).
3. See it working!

## Reminders
Because of how ZeroNet works, every file on your site is **public**, which means that everyone can see your files. You should never use ZeroMux as a personal data backup software. ZeroMux will not encrypt any data for you.

You should never rely on ZeroMux to keep your data permanent. Although ZeroMux will not damage your files, there is no guarantee that every part of your files is distributed to fast and reliable peers.

ZeroMux does not strip metadata.

## Limitations
Both ZeroMux and ZeroNet use bleeding edge features of JavaScript. Browser implementations of these new features have bugs.

Loading a cross-origin Web Worker script is not allowed in major browsers. I believe this is not the correct model regarding both usability and security. On Stack Overflow, there are many questions about loading cross-origin Web Workers, but few of them has a definite answer.

MDN wiki editors wrote about [inline Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers), but there is a disagreement on whether a Blob URL is allowed to load a Web Worker. Google Chrome refuses to load a Blob URL Web Worker defined in an HTTPS page. Due to such disagreement, ZeroMux may not work on HTTPS-enabled ZeroNet gateways.

Firefox renders Remote XUL Error when it tries to pop up a dialog from an iframe sandbox. This [Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1313268) will be fixed in Firefox 52. ZeroMux still works in Firefox, except Firefox assigns random names to files.

When user holds left key and drags on the progress bar of a video element, Firefox prints `uncaught exception: undefined (unknown)` to console. However, ZeroMux still seems to work. Such uncaught exception [can also be seem on YouTube](https://github.com/dailymotion/hls.js/issues/845). A comment on [Stack Overflow](https://stackoverflow.com/questions/41499109/how-to-debug-uncaught-exception-undefined-unknown-in-firefox/41744948) suggests such exception is due to the error in Firefox internals. I assume it is a Firefox bug.

Google Chrome refuses to load any Media Source URL in an iframe sandbox. This [Chromium bug](https://bugs.chromium.org/p/chromium/issues/detail?id=379206) was reported in 2014, but remains unfixed for more than 2 years. WebTorrent is also [affected](https://github.com/feross/webtorrent/issues/783) by this bug. Video streaming does not work in Google Chrome unless this bug is fixed.

## Ways to Help
You can make ZeroMux project better by simply:
- Testing ZeroMux on your computer, and suggesting ways to improve. [File an Issue](https://github.com/MuxZeroNet/ZeroMux/issues)
- Talking to me [privately](http://127.0.0.1:43110/1CiDoBP8RiWziqiBGEd8tQMy66A6fmnw2V/big/docs/about/) about your experience.

You can also help the ZeroNet community by seeding the files you like from some [file sharing Zites](http://127.0.0.1:43110/1CiDoBP8RiWziqiBGEd8tQMy66A6fmnw2V/big/docs/about/demos/).

You can help us test [I2P support](https://github.com/HelloZeroNet/ZeroNet/issues/45), so that we can have even more seeders in the future.

There are some browser bugs which ZeroNet developers are unable to fix. You can help us persuade Chromium developers that [blocking `blob:null/` in an iframe sandbox](https://bugs.chromium.org/p/chromium/issues/detail?id=379206) should be considered as a bug, not a feature. This long standing bug prevents MSE APIs from working properly in an iframe sandbox.

You can also donate to [ZeroNet](https://github.com/HelloZeroNet/ZeroNet) and help keep both projects alive.

## Acknowledgement
ZeroMux benefits from the super-fast [asmCrypto.js](https://github.com/vibornoff/asmcrypto.js/tree/master) library.

ZeroMux gets around [a Firefox bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1313268) with the assistance of [SandBlaster](https://github.com/JamesMGreene/sandblaster).

The code for parsing MP4 codec string is extensively based on [mp4-box-encoding](https://github.com/jhiesey/mp4-box-encoding).
