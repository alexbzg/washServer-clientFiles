'use strict';

/* Controllers */

function Device( data ) {
    for ( var prop in data ) {
        if ( prop != 'services' ) {
            this[ prop ] = data[ prop ];
        }
    }
    this.carDataModified = false;
    this.services = {};
    this.sortedServices = [];
    this.carData = new CarData();
    for ( var id in data.services ) {
        var service = new Service( this, data.services[ id ] );
        this.services[ id ] = service;
        this.sortedServices.push( service );
        }
    this.sortedServices.sort( function( a, b ) { return a.id > b.id } );
    Object.defineProperty( this, 'caption', 
        { get: this._caption } );
    Object.defineProperty( this, 'decCaption', 
        { get: this._decCaption } );

}

Device.prototype._caption = function() {
    if ( this.carData != null && this.carData.caption ) {
        return this.carData.caption;
    } else if ( this.operation != null && 
            this.operation.carData != null && 
            this.operation.carData.caption ) {
        return this.operation.carData.caption;
    } else {
        return '';
    }
};

Device.prototype._decCaption = function() {
    if ( this.carData != null && this.carData.caption ) {
        return this.carData.decCaption();
    } else if ( this.operation != null && 
            this.operation.carData != null && 
            this.operation.carData.caption ) {
        return this.operation.carData.decCaption();
    } else {
        return '';
    }
};


Device.prototype.update = function( data ) {
    for ( var prop in data ) {
        if ( prop == 'services' ) {
            for ( var sId in data.services ) {
                this.services[ sId ].update( data.services[ sId ] );
            } 
        } else {
            console.log( prop + ": " + data[ prop ] );
            this[ prop ] = data[ prop ];
        }
    }
}

Device.prototype.click = function() {
    pythonSend( { signal: { device: this.id, 
            type: this.active ? 'stop' : 'start' } } );    
}

Device.prototype.setCarData = function( carData, manual ) {
    this.carData = carData.copy();
    this.carDataModified = manual;
}

function Service( device, data ) {
    this.device = device;
    for ( var prop in data ) {
        this[ prop ] = data[ prop ];
    }
}

Service.prototype.update = function( data ) {
    for ( var prop in data ) {
        if ( prop == 'operationDetail' ) {
            this.operationDetail = operation[ this.device.id ].details[ 
                this.device.id ][ data[ prop ] ];
        } else {
            this[ prop ] = data[ prop ];
        }
    }
}

function Operation( data, $scope ) {
    this.details = {};
    this.detailData = [];
    this.id = data.id;
    this.$scope = $scope;
    this.cell = null;
    this.stop = data.stop;
    this.start = data.start;
    this.setDevice( data.device );
    this.services = {};
    if ( this.device.operation == this && 
            this.device.carDataModified )
        this.setCarData( this.device.carData );
    else {
        var carData = new CarData();
        carData.setCar( data.car );
        carData.setNoLP( data.noLP );
        carData.setServiceMode( data.serviceMode );
        carData.client = data.client;
        this.setCarData( carData );
    }
    for ( var deviceId in data.details ) {
        this.details[ deviceId ] = {};
        for ( var serviceId in data.details[ deviceId ] ) {
            this.details[ deviceId ][ serviceId ] = 
                new OperationDetail( this, $scope.devices[ deviceId ],
                    $scope.devices[ deviceId ].services[ serviceId ],
                        data.details[ deviceId ][ serviceId ] );
        }
    }
    if ( !( this.carData.car && this.carData.car.notpayed ) )
        this.updateTotal();
    for ( var prop in data ) {
        if ( !( prop in this ) ) {
            this[ prop ] = data[ prop ];
        }
    }
    Object.defineProperty( this, 'caption', 
        { get: this._caption } );
    Object.defineProperty( this, 'decCaption', 
        { get: this._decCaption } );

}

Operation.prototype._detailData = function() { 
    var data = {};
    for ( var dId in this.details ) {
        var devices = this.$scope.devices;
        for ( var sId in devices[ dId ].services ) {
            if ( !( sId in data ) ) {
                data[ sId ] = 
                    { name: devices[dId].services[sId].name,
                        total: 0,
                        qty: 0,
                        id: sId };
            }
            if ( sId in this.details[dId] ) {
                data[sId].total += this.details[dId][sId].total;
                data[sId].qty += this.details[dId][sId].qty;
            }
        }
    }
    var r = [];
    angular.forEach( data, function( value, key ) {
        value.sTotal = formatSum( value.total );
        value.time = formatSeconds( value.qty );
        this.push( value );
        }, r );
    return r;
};


Operation.prototype.setCarData = function( carData, manual ) {
    this.carData = carData.copy();
    var toSend = carData.copy();
    if ( toSend.car )
        toSend.car = { id: toSend.car.id };
    toSend.operation = this.id;
    if ( manual ) 
        pythonSend( { setCarData: toSend } );
};

Operation.prototype.closeQuery = function( pay ) {
    var toSend = { closeOperation: { id: this.id, pay: pay } };
    pythonSend( toSend );
}

Operation.prototype.setCell = function( row, cell ) {
    this.$scope.operationsButtons[ row ][ cell ] = this;
    this.cell = [ row, cell ];
}

Operation.prototype.doClose = function() {
    if ( this.$scope.operationsQueue.length > 0 ) 
        this.$scope.operationsQueue.shift().setCell( 
                this.cell[0], this.cell[1] )
    else
        this.$scope.operationsButtons[ this.cell[0] ][
            this.cell[1] ] = {};
    
}

Operation.prototype.update = function( data ) {
    if ( data.closed ) {
        this.doClose();
        return;
    }
    for ( var prop in data ) {
        if ( prop == 'device' ) {
            this.setDevice( data.device );
        } else if ( prop == 'car' ) {
            this.setCar( data.car );
        } else if ( prop == 'details' ) {
            for ( var deviceId in data.details ) {
                if ( !( deviceId in this.details ) ) {
                    this.details[ deviceId ] = {};
                }
                for ( var serviceId in data.details[ deviceId ] ) {
                    if ( serviceId in this.details[ deviceId ] ) {
                        this.details[ deviceId ][ serviceId ].update( 
                                data.details[ deviceId ][ serviceId ] );
                    } else {
                        this.details[ deviceId ][ serviceId ] =
                            new OperationDetail( this, 
                                this.$scope.devices[ deviceId ],
                                this.$scope.devices[ deviceId 
                                    ].services[ serviceId ],
                                data.details[ deviceId ][ serviceId ] );
                    }
                }
            }
        } else {
            this[ prop ] = data[ prop ];
        }
    }
    if ( ( 'stop' in data ) && ( data.stop != null ) ) {
        this.doStop();
    }
};

Operation.prototype._caption = function() {
    if ( this.carData != null && this.carData.caption ) {
        return this.carData.caption;
    } else if ( this.stop != null ) {
        return "Мойка " + this.device.name;
    } else {
        return '';
    }
};

Operation.prototype._decCaption = function() {
    if ( this.carData != null && this.carData.caption ) {
        return this.carData.decCaption();
    } else if ( this.stop != null ) {
        return "Мойка " + this.device.name;
    } else {
        return '';
    }
};


Operation.prototype.updateTotal = function() {
    this.total = 0;
    this.detailData = [];
    for ( var dId in this.details ) {
        var devices = this.$scope.devices;
        for ( var sId in devices[ dId ].services ) {
            if ( !( sId in this.detailData ) ) {
                this.detailData[ sId ] = 
                    { name: devices[dId].services[sId].name,
                        total: 0,
                        qty: 0,
                        id: sId };
            }
            if ( sId in this.details[dId] ) {
                this.detailData[sId].total += 
                    this.details[dId][sId].total;
                this.detailData[sId].qty += 
                    this.details[dId][sId].qty;
           }
        }
    }
    var operation = this;
    angular.forEach( this.detailData, function( value ) {
        value.stringTotal = formatSum( value.total );
        value.time = formatSeconds( value.qty );
        operation.total += Number( value.stringTotal );
        } );

    if ( this.carData.car && this.carData.car.notpayed ) {
        if ( this.total > 50 && 
                !( this.id in this.carData.car.notpayed ))  
            this.carData.car.notpayed[ this.id ] = { id: this.id,
                total: this.total, start: this.start };
        this.total = 0;
        angular.forEach( this.carData.car.notpayed, function( value ) {
            value.total = formatSum( value.total )
            operation.total += Number( value.total );
            } );
    }
   
    this.stringTotal = formatSum( this.total );
};

Operation.prototype.setDevice = function( deviceId ) {
    this.device = this.$scope.devices[ deviceId ];
    if ( !( this.stop ) ) {
        this.device.operation = this;
        if ( this.device.carDataModified ) 
            this.setCarData( this.device.carData, true );
    } else {
        this.doStop();
    }
};

Operation.prototype.doStop = function() {
    var ob = this.$scope.operationsButtons;
    var rows = ob.length;
    for ( var row = 0; row < rows; row++ ) {
        for ( var cell = 0; 
                cell < this.$scope.operationsButtonsRows[ row ]; 
                cell++ )
            if ( !( 'id' in ob[ row ][ cell ] ) ) {
                this.setCell( row, cell );
                break;
            }
        if ( this.cell != null )
            break;
    }
    if ( this.cell == null )
        this.$scope.operationsQueue.push( this );
    if ( this.device.operation == this ) {
        this.device.operation = null;
        for ( var id in this.device.services ) {
            this.device.services[ id ].operationDetail = null;
        }
        this.device.setCarData( new CarData() );
    }
};

function OperationDetail( operation, device, service, data ) {
    this.operation = operation;
    this.device = device;
    this.service = service;
    if ( operation.device == this.device && !operation.stop ) {
        this.service.operationDetail = this;
    }
    this.update( data );
};

OperationDetail.prototype.update = function( data ) {
    this.total = Number( data.total );
    this.time = formatSeconds( data.qty );
    this.sTotal = formatSum( this.total );
    this.qty = data.qty;
    this.operation.updateTotal();
};

function formatSeconds( time ) {
    if ( time > 0 ) {
        var sec = time % 60;
        var min = ( time - sec ) / 60;
        var strSec = '' + sec,
            strMin = '' + min;
        if ( sec < 10 ) {
            strSec = '0' + strSec;
        }
        if ( min < 10 ) {
            strMin = '0' + strMin;
        }
        return strMin + ":" + strSec;
    } else {
        return "";
    }

}

function formatSum( sum ) {
    if ( sum == 0 ) {
        return "";
    } else if ( sum < 1 ) {
        return "1";
    } else {
        return ( Number( sum ) ).toFixed( 0 );
    }
}

function CarData() {
    this.noLP = false;
    this.serviceMode = false;
    this.car = null;
    this.client = null;
    Object.defineProperty( this, 'caption',
        { get: this._caption } );
}

CarData.prototype.copy = function() {
    var cd = new CarData();
    cd.noLP = this.noLP;
    cd.serviceMode = this.serviceMode;
    cd.car = this.car;
    cd.client = this.client;
    return cd;
};

CarData.prototype._caption = function() {
    if ( this.noLP ) {
        return 'Б/Н';
    } else if ( this.serviceMode ) {
        return 'Диспетчер';
    } else if ( this.client ) {
        return this.client.name;
    } else if ( this.car ) {
        return this.car.lp;
    } else {
        return false;
    }
};

CarData.prototype.decCaption = function() {
    if ( this.car && this.caption == this.car.lp )
        return this.car.decLP;
    else
        return this.caption;
}

CarData.prototype.setServiceMode = function( value ) {
    if ( value ) {
        this.noLP = false;
        this.car = null;
        this.client = null;
    }
    this.serviceMode = value;
};

CarData.prototype.setNoLP = function( value ) {
    if ( value ) {
        this.serviceMode = false;
        this.car = null;
        this.client = null;
    }
    this.noLP = value;
};

CarData.prototype.setCar = function( car ) {
    if ( car ) {
        this.serviceMode = false;
        this.noLP = false;
        this.client = car.client;
        car.lp = car.licenseNo + car.region;
        car.decLP = car.lp.replace( /\d+/, 
            '<span class="car_number_digit">$&</span>' );
    }
    this.car = car;
};

function Keyboard() {
    this.keys = [ [ [ '1', '2', '3', '4', '5', '6', '7', '8', 
                    '9', '0' ] ],
                  [ [ 'A', 'B', 'E', 'K', 'M', 'H' ],
                  [ 'O', 'P', 'C', 'T', 'Y', 'X' ] ] ];
    this.regions = [ '23', '93', '123', '01' ];
    this.carData = new CarData();
    this.visible = false;
    this.clear();
};

Keyboard.prototype.clear = function() {
    this.modified = false;
    this.value = '';
    this.carData = new CarData();
};

Keyboard.prototype.setState = function( state ) {
    if ( !this.carData[ state ] ) {
        if ( state == 'noLP' ) {
            this.carData.setNoLP( true );
        } else {
            this.carData.setServiceMode( true );
        }
        this.modified = true;
        if ( this.carData.caption ) {
            this.value = this.carData.caption;
        }
    }
};

Keyboard.prototype.onClientButton = function( client ) {
    this.carData.car = null;
    this.carData.serviceMode = false;
    this.carData.noLP = false;
    this.carData.client = client;
    this.value = client.name;
    this.modified = true;
};

Keyboard.prototype.clearStates = function() {
    if ( this.carData.noLP || this.carData.serviceMode ) {
        this.carData.noLP = false;
        this.carData.serviceMode = false;
        this.value = '';
    }
};

Keyboard.prototype.add = function( keys ) {
    this.clearStates();
    this.value += keys;
    this.modified = true;
    this.getHints();
};

Keyboard.prototype.backspace = function() {
    if ( this.value != '' ) {
        this.modified = true;
        this.clearStates();
        if ( this.value != '' ) {
            this.value = this.value.substr( 0, 
                    this.value.length - 1 );
        }
    }
    this.getHints();
};

Keyboard.prototype.getHints = function() {
    if ( this.value.length > 2 ) {
        pythonSend( { getLPHints: { pattern: this.value } } );
    }
}

Keyboard.prototype.hintsQueryResult = function( hints ) {
    this.hints = angular.copy( hints );
}
            

Keyboard.prototype.open = function( target ) {
    this.visible = true;
    if ( target instanceof Device ) {
        this.device = target;
        this.target = target.operation == null ? 
            target : target.operation;
    } else{
        this.target = target;
        if ( target.stop == null ) 
            this.device = target.device;
    }
    this.carData = target.carData.copy();
    if ( this.carData.caption ) {
        this.value = this.carData.caption;
    }
};

Keyboard.prototype.close = function( result ) {
    if ( result && this.value == '' ) {
        return;
    }
    if ( result && this.modified ) {
        if ( this.carData.noLP || this.carData.serviceMode ||
                this.carData.client ) {
            this.target.setCarData( this.carData, true );
        } else if ( this.value != '' ) {
            pythonSend( { 'carQuery': this.value } );
            return;
        }
    }
    this.cleanup();
};

Keyboard.prototype.carQueryResult = function( car ) {
    this.carData.setCar( car );
    this.target.setCarData( this.carData, true );
    this.cleanup();
};

Keyboard.prototype.cleanup = function() {
    this.visible = false;
    this.device = null;
    this.target = null;
    this.hints = null;
    this.clear();
};

function SessionWindow() {
    this.visible = false;
    this.auto = false;
    this.operation = null;
};

SessionWindow.prototype.open = function( operation ) {
    if ( !( 'id' in operation ) )
        return;
    this.operation = operation;
    this.visible = true;
}

SessionWindow.prototype.hide = function() {
    this.operation = null;
    this.visible = false;
}

SessionWindow.prototype.close = function( pay ) {
    this.operation.closeQuery( pay );
    this.hide();
}

var washApp = angular.module('washApp', [ 'ngSanitize' ]);
var updater;
var rawUpdater;

washApp.controller('washCtrl', function($scope) {

        $scope.sortedDevices =  [];  
        $scope.operations = {};
        $scope.operationsButtonsRows = [ 5, 5 ];
        var obrCount = $scope.operationsButtonsRows.length;
        $scope.operationsButtons = [];
        for ( var rc = 0; rc < obrCount; rc++ ) {
            $scope.operationsButtons[ rc ] = [];
            for ( var cc = 0; cc < $scope.operationsButtonsRows[ rc ]; 
                cc++ )
                $scope.operationsButtons[ rc ][ cc ] = {};
        }
        $scope.operationsQueue = [];
        $scope.keyboard = new Keyboard();
        $scope.sessionWindow = new SessionWindow();
        $scope.autoDevices = [];

        updater = function( d ) {
            $scope.$apply( function() {
                rawUpdater( d )
            } );
        };

        rawUpdater = function( d ) {
         console.log( JSON.stringify( d ) );
                if ( 'create' in d ) {
//                    console.log( JSON.stringify( d ) );
                    if ( 'devices' in d ) {
                        $scope.devices = {};
                        var tmpDevices = [];
                        $scope.autoDevices = [];
                        for ( var id in d.devices ) {
                            if ( !d.devices[ id ].auto ) {
                                var device = 
                                    new Device( d.devices[ id ] );
                                tmpDevices.push( device );
                                $scope.devices[ id ] = device;
                            } else {
                                $scope.autoDevices.push(
                                    { id: d.devices[ id ].id,
                                    defPrice: d.devices[ id ].defPrice,
                                    name: d.devices[ id ].name } );
                            }
                        }
                        tmpDevices.sort( function( a, b ) 
                            { return ( a.name > b.name ); } );
                        var dLength = tmpDevices.length;
                        for ( var c = 0; c < dLength / 2; c++ ) {
                            $scope.sortedDevices.push( [] );
                        }
                        for ( var c = 0; c < dLength; c++ ) {
                            $scope.sortedDevices[ Math.floor( c / 2 ) 
                                ].push( tmpDevices[ c ] );
                        }

                    }
                    if ( 'operations' in d ) {
                        for ( var id in d.operations ) {
                            $scope.operations[ id ] = 
                                new Operation( d.operations[ id ], 
                                        $scope );
                        }
                    }
                    if ( 'cars' in d  ) {
                        $scope.keyboard.carQueryResult( d.cars );
                    }
                    if ( 'clientButtons' in d ) {
                        $scope.keyboard.clientButtons = d.clientButtons;
                    }
                } else {
                    if ( 'lpHints' in d ) {
                        $scope.keyboard.hintsQueryResult(
                            d.lpHints )
                        return;
                    }
                    for ( var type in d ) {
                        for ( var id in d[ type ] ) {
                            //console.log( type );
                            //console.log( $scope[ type ][ id ] );
                            $scope[ type ][ id ].update( 
                                    d[ type ][ id ] );
                        }
                    } 
                } 
        };



});


function test_update( file ) {
    angular.element(document.getElementsByTagName('html')[0]
        ).injector().get('$http').get( 'debug/' + file + '.json' 
        ).success(
            function( data ){ rawUpdater( data ); }
        ); 
}
