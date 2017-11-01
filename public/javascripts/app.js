(function() {
    var client = new PeerManager();

    var mediaConfig = {
        audio: true,
        video: {
            mandatory: {},
            optional: []
        }
    };

    function cameraService(camera) {
        function cameraStart() {
            return requestUserMedia(mediaConfig)
                .then(function(stream) {
                    attachMediaStream(camera.preview, stream);
                    client.setLocalStream(stream);
                    camera.stream = stream;
                    $rootScope.$broadcast('cameraIsOn', true);
                })
                .catch(Error('Failed to get access to local media.'));
        };

        function cameraStop() {
            return new Promise(function(resolve, reject) {
                    try {
                        //camera.stream.stop() no longer works
                        for (var track in camera.stream.getTracks()) {
                            track.stop();
                        }
                        camera.preview.src = '';
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })
                .then(function(result) {
                    $rootScope.$broadcast('cameraIsOn', false);
                });
        };
        return {
            start: cameraStart,
            stop: cameraStop
        };
    }

    function getClient() {
        return client;
    }

    function getMediaConfig() {
        return mediaConfig;
    }



    $.fn.localStream = function() {
        var template = '<p class="localStreanUserNameLabel">User Name: <input type="text" class="localStreanUserNameText"/></p>' +
            '<video id="localStreamVideo" muted="muted" autoplay="true"></video>' +
            '<li class="camToggler" data-status="false">' +
            'Start' +
            '</li>' +
            '<div class="localStreamShareWrapper">' +
            '<p>Share your Link:</p>' +
            '<a class="localStreamShareLink"></a>' +
            '</div>';

        this.html(template);
        var localStreamVideo = $(this).find('#localStreamVideo');
        var userNameText = $(this).find('.localStreanUserNameText');
        var camToggler = $(this).find('.camToggler');
        var localStreamShareLink = $(this).find('.localStreamShareLink');
        var localStreamShareWrapper = $(this).find('.localStreamShareWrapper');
        var cameraIsOn = camToggler.attr('data-status');
        var camera = cameraService(localStreamVideo);
        var client = getClient();
        userNameText.val('Guest');

        if (cameraIsOn == 'false') {
            localStreamShareWrapper.hide();
        }

        camToggler.click(function() {
            if (cameraIsOn == 'true') {
                camera.stop()
                    .then(function(result) {
                        client.send('leave');
                        client.setLocalStream(null);
                        cameraIsOn = 'false';
                        camToggler.attr('data-status', 'false');
                        localStreamShareWrapper.show();
                    })
                    .catch(function(err) {
                        console.log(err);
                    });

            } else {
                camera.start()
                    .then(function(result) {
                        localStreamShareLink.html(window.location.host + '/' + client.getId());
                        client.send('readyToStream', { name: userNameText.val() });
                        cameraIsOn = 'true';
                        camToggler.attr('data-status', 'true');
                        localStreamShareWrapper.show();
                    })
                    .catch(function(err) {
                        console.log(err);
                    });
            }
        });
    }


    $.fn.remoteStreams = function() {
        var template = '<h2>Remote Streams</h2>' +
            '<div id="remoteVideosContainer"></div>' +
            '<table>' +
            '<thead>' +
            '<tr>' +
            '<th>Stream</th><th class="viewStream">1-way</th><th>2-way</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody class="remoteStreamList">' +
            '</tbody>' +
            '</table>' +
            '<li style="width: 240px" class="refreshStreams">' +
            '<a href="javascript:void(0)">Refresh</a>' +
            '</li>';


        this.html(template);
        var remoteVideosContainer = $(this).find('#remoteVideosContainer');
        var remoteStreamList = $(this).find('.remoteStreamList');
        var refreshStreams = $(this).find('.refreshStreams');
        var localStreamVideo = $('#localStreamVideo');
        var camera = cameraService(localStreamVideo);
        var remoteStreams = [];
        var client = getClient();

        function getstreamListTemplate(data) {
            return '<tr class="list-' + data.id + '"  data-stream-id="' + data.id + '" data-name="' + data.name + '" data-is-playing="' + data.isPlaying + '">' +
                '<td><a data-name="' + data.name + '"></a></td>' +
                '<td><a class="viewStream">View</a></td>' +
                '<td><a class="callStream">Call</a></td>' +
                '</tr>';
        }


        function getStreamById(id) {
            for (var i = 0; i < remoteStreams.length; i++) {
                if (remoteStreams[i].id === id) { return remoteStreams[i]; }
            }
        }

        function loadData() {
            $.ajax({
                url: '/streams.json',
                type: 'GET',
                success: function(data) {
                    if (data.length > 0) {
                        var streams = data.filter(function(stream) {
                            return stream.id != client.getId();
                        });

                        for (var i = 0; i < streams.length; i++) {
                            var stream = getStreamById(streams[i].id);
                            streams[i].isPlaying = (!!stream) ? stream.isPLaying : false;
                        }
                        remoteStreams = streams;
                        remoteStreams.forEach(function(stream) {
                            remoteStreamList.append(getstreamListTemplate(stream));
                        })
                    }

                },
                error: function(data) {
                    console.log('error');
                    console.log(data);
                }
            });
        }

        refreshStreams.click(function() {
            loadData();
        });


        var viewStream = $('.viewStream');
        var callStream = $('.callStream');

        function generateStreamData(el) {
            var id = el.attr('data-stream-id');
            var name = el.attr('data-name');
            var isPlaying = el.attr('data-is-playing') == 'true' ? true : false;
            return { id: id, name: name, isPlaying: isPlaying }
        }

        function alternatePlayingStatus(el, stream) {
            var shouldBeStatus = stream.isPLaying ? 'false' : 'true';
            el.attr('data-is-playing', shouldBeStatus);
        }

        viewStream.click(function() {
            var el = $(this).parent('tr');
            var stream = generateStreamData(el);
            client.peerInit(stream.id);
            alternatePlayingStatus(el, stream);
        });


        function callStream(stream, el) {

            if (!el) {
                stream = { id: stream, name: 'current stream', isPlaying: false };
                remoteStreams.push(stream);
                remoteStreamList.append(getstreamListTemplate(stream));
                el = $('.list-' + stream.id)
            }


            if (camera.isOn) {
                client.toggleLocalStream(stream.id);
                if (stream.isPlaying) {
                    client.peerRenegociate(stream.id);
                } else {
                    client.peerInit(stream.id);
                }
                alternatePlayingStatus(el, stream);
            } else {
                camera.start()
                    .then(function(result) {
                        client.toggleLocalStream(stream.id);
                        if (stream.isPlaying) {
                            client.peerRenegociate(stream.id);
                        } else {
                            client.peerInit(stream.id);
                        }
                        alternatePlayingStatus(el, stream);
                    })
                    .catch(function(err) {
                        console.log(err);
                    });
            }
        }

        callStream.click(function() {
            var el = $(this).parent('tr');
            var stream = generateStreamData(el);
            callStream(stream, el);
        });


        loadData();
        if (location.pathname != '/') {
            callStream(location.pathname.slice(1), null);
        };


    }


})(jQuery);