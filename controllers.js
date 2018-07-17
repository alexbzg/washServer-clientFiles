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
    this.childDevices = [];
    this.carData = new CarData();
    this.linked = false;
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


Device.prototype.toggleLink = function() {
    this.linked = !this.linked;
    checkLink();
}

Device.prototype.togglePresenceDetector = function() {
    this.detectsPresence = !this.detectsPresence;
    pythonSend( { setDetectsPresence: 
            { device: this.id, value: this.detectsPresence } } );
}


Device.prototype.checkLink = function() {
    var chDL = this.childDevices.length;
    for ( var c = 0; c < chDL; c++ )
        this.childDevices[ c ].checkLink();
    if ( this.linked ) {
        if ( this.operation && this.parentDevice.operation ) {
            pythonSend( { linkOperation: 
                    { link: true, id: this.operation.id } } );
        } else if ( this.active && !this.parentDevice.active ) {
            this.parentDevice.click();
        } else if ( this.parentDevice.active && !this.active ) {
            this.click();
        }
    } else {
        if ( this.operation && this.operation.parentOperation )
            pythonSend( { linkOperation:
                    { link: false, id: this.operation.id } } );
    }
}

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
    Object.defineProperty( this, 'caption', 
        { get: this._caption } );
    Object.defineProperty( this, 'decCaption', 
        { get: this._decCaption } );
    this.details = {};
    this.detailData = [];
    this.id = data.id;
    this.$scope = $scope;
    this.cell = null;
    this.stop = data.stop;
    this.start = data.start;
    var carData = new CarData();
    carData.setCar( data.car );
    carData.setNoLP( data.noLP );
    carData.setServiceMode( data.serviceMode );
    carData.client = data.client;
    this.setCarData( carData );
    this.services = {};
    for ( var deviceId in data.details ) {
        this.details[ deviceId ] = {};
        for ( var serviceId in data.details[ deviceId ] ) {
            this.details[ deviceId ][ serviceId ] = 
                new OperationDetail( this, $scope.devices[ deviceId ],
                    $scope.devices[ deviceId ].services[ serviceId ],
                        data.details[ deviceId ][ serviceId ] );
        }
    }
//    if ( !( this.carData.car && this.carData.car.notpayed ) )
//        this.updateTotal();
    for ( var prop in data ) {
        if ( !( prop in this ) ) {
            this[ prop ] = data[ prop ];
        }
    }
    this.setDevice( data.device );
    if ( this.device.operation == this && 
            this.device.carDataModified )
        this.setCarData( this.device.carData );

}

Operation.prototype._detailData = function() { 
    var data = {};
    var details = angular.merge( {}, this.details );
    angular.forEach( this.childOperations, function( val ) {
            details = angular.merge( details, val.details );
            } );
    for ( var dId in details ) {
        var devices = this.$scope.devices;
        for ( var sId in devices[ dId ].services ) {
            if ( !( sId in data ) ) {
                data[ sId ] = 
                    { name: devices[dId].services[sId].name,
                        total: 0,
                        qty: 0,
                        id: sId };
            }
            if ( sId in details[dId] ) {
                data[sId].total += details[dId][sId].total;
                data[sId].qty += details[dId][sId].qty;
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


Operation.prototype.doClose = function() {
    this.button.removeOperation( this );
    
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
        } else if ( prop == "parentOperation" ) {
            var parentOp = 
                this.$scope.operations[ data.parentOperation ] ;
            this.parentOperation = parentOp;
            parentOp.childOperations.push( this );
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


Operation.prototype.hasCar = function() {
    return this.carData && this.carData.car && 
            !this.carData.serviceMode &&
            !this.carData.noLP;
}

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

   
    this.stringTotal = formatSum( this.total );
};

Operation.prototype.setDevice = function( deviceId ) {
    this.device = this.$scope.devices[ deviceId ];
    if ( !( this.stop ) ) {
        this.device.operation = this;
        if ( this.device.carDataModified ) 
            this.setCarData( this.device.carData, true );
        if ( deviceId in this.details )
            for ( var sId in this.details[ deviceId ] )
                this.device.services[ sId ].operationDetail =
                    this.details[ deviceId ][ sId ];            
        this.device.checkLink();
    } else {
        this.doStop();
    }
};

Operation.prototype.doStop = function() {
    if ( this.parentOperation )
        return;
    if ( this.hasCar() && 
        this.carData.car.id in this.$scope.operationsButtonsByCar )
        this.$scope.operationsButtonsByCar[ 
            this.carData.car.id ].addOperation( this );
    else
        new OperationButton( this );
    if ( this.device && this.device.operation == this ) {
        this.device.operation = null;
        for ( var id in this.device.services ) {
            this.device.services[ id ].operationDetail = null;
        }
        this.device.setCarData( new CarData() );
    }
    if ( this.carData && this.carData.car && this.carData.car.notpayed )
        this.updateTotal();
};

function OperationDetail( operation, device, service, data ) {
    this.operation = operation;
    this.device = device;
    this.service = service;
    if ( !operation.stop && operation.device == device )
        this.service.operationDetail = this;
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

function formatSum( sum, z ) {
    if ( sum == null || sum == 0 ) {
        return z ? '0' : "";
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

CarData.prototype.equals = function( carData ) {
    if ( ( this.car == null && carData.car != null ) ||
            ( this.car != null && carData.car == null ) ||
            ( this.car != null && carData.car != null &&
              this.car.id != carData.car.id ) )
        return false;
    if ( ( this.client == null && carData.client != null ) ||
            ( this.client != null && carData.client == null ) ||
            ( this.client != null && carData.client != null &&
              this.client.id != carData.client.id ) )
        return false;
    if ( ( this.serviceMode != carData.serviceMode ) ||
            ( this.noLP != carData.noLP ) )
        return false;
    return true;
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

function AutoSession() {
    this.auto = true;
    this.carData = new CarData();
}

AutoSession.prototype.setCarData = function( carData ) {
    this.carData = carData.copy();
}

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
    if ( this.carData.noLP || this.carData.serviceMode || 
            this.carData.client ) {
        this.carData.noLP = false;
        this.carData.serviceMode = false;
        this.carData.client = null;
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
        if ( target instanceof Operation && target.stop == null ) 
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

function SessionWindow( $scope ) {
    this.visible = false;
    this.auto = false;
    this.operation = null;
    this.$scope = $scope;
};

SessionWindow.prototype.open = function( operations ) {
    if ( !( 'operations' in operations ) && !operations.auto )
        return;
    this.operations = operations;
    this.visible = true;
}

SessionWindow.prototype.openAuto = function() {
    this.open( new AutoSession() );            
    this.setAutoDevice( this.autoDeviceDefault );
}

SessionWindow.prototype.setAutoDevice = function( ad ) {
    this.operations.device = ad;
    this.operations.total = ad.defPrice;
    this.operations.stringTotal = ad.defPrice;
}

SessionWindow.prototype.hide = function() {
    this.operation = null;
    this.visible = false;
}

SessionWindow.prototype.close = function( pay ) {
    var cd = this.operations.carData;
    if ( cd.car == null && !cd.noLP
            && !cd.serviceMode && 
            cd.client == null ) {
        this.carAlert = true;
        var sessionWindow = this;
        var alertCount = 5;
        var intId = setInterval( 
                function() {
                    sessionWindow.$scope.$apply( function() {
                        sessionWindow.carAlert = 
                            !sessionWindow.carAlert; 
                            } );
                    alertCount--;
                    if ( alertCount == 0 ) {
                        clearInterval( intId );
                    }
                    }, 1000 );
        return;
    }
    if ( this.operations.auto ) 
        pythonSend( { autoOperation: 
            { device: this.operations.device.id,
                carData: this.operations.carData,
                total: this.operations.total,
                pay: pay ? this.operations.total : 0 } } );
    else
        this.operations.closeQuery( pay );
    this.hide();
}

function OperationButton( operation ) {
    this.$scope = operation.$scope;
    this.operations = [];
    this.addOperation( operation );
    var ob = this.$scope.operationsButtons;
    var rows = ob.length;
    for ( var row = 0; row < rows; row++ ) {
        for ( var cell = 0; 
                cell < this.$scope.operationsButtonsRows[ row ]; 
                cell++ )
            if ( !( 'operations' in ob[ row ][ cell ] ) ) {
                this.setCell( row, cell );
                break;
            }
        if ( this.cell != null )
            break;
    }
    if ( this.cell == null )
        this.$scope.operationsButtonsQueue.push( this );
}

OperationButton.prototype.setCell = function( row, cell ) {
    this.$scope.operationsButtons[ row ][ cell ] = this;
    this.cell = [ row, cell ];
}


OperationButton.prototype.updateOpData = function() {
    if ( this.operations[0].hasCar() ) {
        this.car = this.operations[0].carData.car;
        this.$scope.operationsButtonsByCar[ this.car.id ] = this;
    } else {
        if ( this.car != null )
            delete this.$scope.operationsButtonsByCar[ this.car.id ];
        this.car = null;
    }
    this.carData = this.operations[0].carData;
    var devices = [];
    this.start = this.operations[0].start;
    this.stop = this.operations[0].stop;
    var start = this.operations[0].startEpoch;
    var stop = this.operations[0].stopEpoch;
    var opL = this.operations.length;
    for ( var c = 0; c < opL; c++ ) {
        var op = this.operations[c];
        if ( devices.indexOf( op.device.name ) == -1 )
            devices.push( op.device.name );
        if ( start > op.startEpoch ) {
            start = op.startEpoch;
            this.start = op.start;
        }
        if ( stop < op.stopEpoch ) {
            stop = op.stopEpoch;
            this.stop = op.stop;
        }
    }
    this.device = { name: devices.join( ', ' ) };
    this.updateTotal();
    this.caption = this.operations[0].caption;
    this.decCaption = this.operations[0].decCaption;
}

OperationButton.prototype.addOperation = function( operation ) {
    this.operations.push( operation );
    operation.button = this;
    this.updateOpData();
}

OperationButton.prototype.closeQuery = function( pay ) {
    var opL = this.operations.length;
    for ( var c = 0; c < opL; c++ )
        this.operations[ c ].closeQuery( pay );
}

OperationButton.prototype.setCarData = function( carData, manual ) {
    var op = this.operations[0];
    if ( !carData.equals( op.carData ) ) {
        this.operations[0].setCarData( carData, manual );
        if ( this.operations.length > 1 ) {
            this.removeOperation( op );
            new OperationButton( op );
        } else  
            this.updateOpData();
    }
}

OperationButton.prototype.removeOperation = function( operation ) {
    var opIdx = this.operations.indexOf( operation );
    this.operations.splice( opIdx, 1 );
    operation.button = null;
    if ( Object.keys( this.operations ).length == 0 ) {
        if ( this.$scope.operationsButtonsQueue.length > 0 ) 
            this.$scope.operationsButtonsQueue.shift().setCell( 
                    this.cell[0], this.cell[1] )
        else
            this.$scope.operationsButtons[ this.cell[0] ][
                this.cell[1] ] = {};
        if ( this.car )
            delete this.$scope.operationsButtonsByCar[ this.car.id ];
    } else {
        this.updateOpData();
    }
}

OperationButton.prototype.updateTotal = function() {
    this.detailData = [];
    this.total = 0;
    var opL = this.operations.length;
    for ( var c = 0; c < opL; c++ ) {
        var op = this.operations[ c ];
        for ( var dId in op.details ) {
            var devices = this.$scope.devices;
            for ( var sId in devices[ dId ].services ) {
                if ( !( sId in this.detailData ) ) {
                    this.detailData[ sId ] = 
                        { name: devices[dId].services[sId].name,
                            total: 0,
                            qty: 0,
                            id: sId };
                }
                if ( sId in op.details[dId] ) {
                    this.detailData[sId].total += 
                        Number( op.details[dId][sId].total );
                    this.detailData[sId].qty += 
                        Number( op.details[dId][sId].qty );
                }
            }
        }
    }
    var ob = this;
    angular.forEach( this.detailData, function( value ) {
        value.stringTotal = formatSum( value.total );
        value.time = formatSeconds( value.qty );
        ob.total += Number( value.stringTotal );
        } );

    if ( this.carData.car && this.carData.car.notpayed ) {
        for ( opId in this.operations ) {
            var op = this.operations[opId];
            if ( op.total > 50 && 
                !( opId in this.carData.car.notpayed ) )  
                this.carData.car.notpayed[ opId ] = { id: opId,
                    total: op.total, start: op.start };
        }
        this.total = 0;
        angular.forEach( this.carData.car.notpayed, function( value ) {
            value.total = formatSum( value.total )
            ob.total += Number( value.total );
            } );
    }
   
    this.stringTotal = formatSum( this.total );

}

function ShiftWindow() {
    this.visible = false;
}

ShiftWindow.prototype.show = function() {
    this.visible = true;
    pythonSend( { getShiftData: 1 } );
}

ShiftWindow.prototype.shiftQueryResult = function( data ) {
    this.operatorId = data.operator_id;
    if ( !this.operatorId ) {
        this.operators.splice( 0, 0, 
            { id:0, name: 'Выберите оператора' } );
        this.operatorId = 0;
    } else if ( !this.operators[0].id )
        this.operators.splice( 0, 1 );
    this.setSelectedOperator();
    this.start = data.start;
    this.total = formatSum( data.total, true );
    this.notpayed = formatSum( data.notpayed, true );
    this.qty = data.qty;
}

ShiftWindow.prototype.newShiftQuery = function( operatorId ) {
    if ( confirm( "Закрыть смену?" ) )
        pythonSend( { newShift: { operator: this.selectedOperator.id } } );
    else
        this.setSelectedOperator();
}

ShiftWindow.prototype.setSelectedOperator = function() {
    var opId = this.operatorId;
    var selected = this.operators.filter( 
            function( o ) { return o.id == opId; } );
    this.selectedOperator = selected[0];
}



var washApp = angular.module('washApp', [ 'ngSanitize' ]);
var updater;
var pageBuilt = false;
var rawUpdater;

function getHeight() {
    var body = document.body,
        html = document.documentElement;

    return Math.max( body.scrollHeight, 
            body.offsetHeight, html.clientHeight, 
            html.scrollHeight, html.offsetHeight );

}

washApp.controller('washCtrl', function($scope) {

        $scope.sortedDevices =  [];  
        $scope.sortedDevicesArray = [];
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
        $scope.operationsButtonsQueue = [];
        $scope.operationsButtonsByCar = {};
        $scope.keyboard = new Keyboard();
        $scope.sessionWindow = new SessionWindow( $scope );
        $scope.shiftWindow = new ShiftWindow();
        $scope.autoDevices = [];

        updater = function( d ) {
            $scope.$apply( function() {
                rawUpdater( d )
                });
            if ( pageBuilt ) {
                pageBuilt = false;
                var height = getHeight()
                console.log( height );
                console.log( window.innerHeight );
                var scale = 1;
                while ( height * scale > window.innerHeight ) {
                    scale *= 0.95;
                    document.body.style.webkitTransform = 
                    //Chrome, Opera, Safari
                    document.body.style.msTransform =           // IE 9
                    document.body.style.transform = 'scaleY(' +
                            scale + ')'
                }
            } };

        rawUpdater = function( d ) {
//console.log( JSON.stringify( d ) );
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
                            $scope.sortedDevicesArray.push( device );
                        } else {
                            var params = ( new X2JS() 
                                ).xml_str2json(
                                d.devices[ id ].paramsXML ).params;
                            var ad =
                                { id: id,
                                defPrice: params._default,
                                name: params._name,
                                isDef: params._default_device };
                            $scope.autoDevices.push( ad );
                            if ( ad.isDef )
                                $scope.sessionWindow.autoDeviceDefault 
                                    = ad;
                        }
                    }
                    $scope.sortedDevicesArray.sort( function( a, b ) 
                        { return ( a.name > b.name ? 1 : -1 ); } );



                    var childDevices = tmpDevices.filter( function( d ) {
                        return d.parentId; } );                    
                    var chDL = childDevices.length;
                    var pairedDevices = [];
                    for ( var c = 0; c < chDL; c++ ) {
                        var parentD = $scope.devices[
                            childDevices[ c ].parentId ];
                        pairedDevices.push( 
                            [ parentD,
                                childDevices[ c ] ] );
                        parentD.childDevices = [ childDevices[ c ] ];
                        childDevices[ c ].parentDevice = parentD;
                    }

                    var singleDevices = tmpDevices.filter( 
                        function( d ) {
                        for ( var c = 0; c < chDL; c++ )
                            if ( d.id == childDevices[ c ].parentId ||
                                d == childDevices[ c ] )
                                return false;
                        return true;
                        } );
                    singleDevices.sort( function( a, b ) 
                        { return ( a.name > b.name ? 1 : -1 ); } );

                
           
                    var sDL = singleDevices.length;
                    for ( var c = 0; c < ( sDL - 1 ) / 2; c++ ) 
                        $scope.sortedDevices.push( 
                                [ singleDevices[ c * 2 ], 
                                singleDevices[ c * 2 + 1 ] ] );
                    if ( sDL % 2 )
                        $scope.sortedDevices.push( 
                                [ singleDevices[ sDL - 1 ] ] );
                    $scope.sortedDevices = 
                        $scope.sortedDevices.concat( pairedDevices );
                    $scope.sortedDevices.sort( function( a, b ) 
                        { return ( a[0].name > b[0].name ? 1 : -1 ); 
                        } );
                    pageBuilt = true;
                    

                }
                if ( 'operations' in d ) {

                    for ( var id in d.operations ) {
                        $scope.operations[ id ] = 
                            new Operation( d.operations[ id ], 
                                    $scope );
                    }
                    for ( var id in d.operations ) 
                        if ( d.operations[ id ].parentOperation )
                            $scope.operations[ id ].update(
                                { parentOperation: 
                                d.operations[ id ].parenOperation } );

                }
                if ( 'cars' in d  ) {
                    $scope.keyboard.carQueryResult( d.cars );
                }
                if ( 'clientButtons' in d ) {
                    $scope.keyboard.clientButtons = d.clientButtons;
                }
                if ( 'operators' in d ) {
                    $scope.shiftWindow.operators = d.operators;
                }
            } else {
                if ( 'lpHints' in d ) {
                    $scope.keyboard.hintsQueryResult(
                        d.lpHints )
                    return;
                } 
                else if ( 'shiftData' in d ) {
                    console.log( JSON.stringify( d ) );

                    $scope.shiftWindow.shiftQueryResult(
                            d.shiftData );
                    return;
                }
                for ( var type in d ) {
                    for ( var id in d[ type ] ) {
                        //console.log( type );
                        //console.log( $scope[ type ][ id ] );
                        $scope[ type ][ id ].update( 
                                d[ type ][ id ] );
                        if ( type == 'operations' && !( 'details' in d[type][id] ) )
                            console.log( JSON.stringify( d[type][id] ) );
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
