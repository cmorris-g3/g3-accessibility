<?php

use App\Http\Controllers\Api\ActivateController;
use App\Http\Controllers\Api\FindingController;
use App\Http\Controllers\Api\LicenseController;
use App\Http\Controllers\Api\ScanController;
use Illuminate\Support\Facades\Route;

Route::middleware('license:partial')->group(function () {
    Route::post('/activate', [ActivateController::class, 'store']);
    Route::get('/license', [LicenseController::class, 'show']);
});

Route::middleware('license')->group(function () {
    Route::post('/scans', [ScanController::class, 'store']);
    Route::get('/scans/{scan}', [ScanController::class, 'show']);
    Route::post('/scans/{scan}/rescan', [ScanController::class, 'rescan']);
    Route::get('/scans/{scan}/findings', [FindingController::class, 'index']);

    Route::get('/findings', [FindingController::class, 'index']);
    Route::post('/findings/{finding}/ignore', [FindingController::class, 'ignore']);
    Route::post('/findings/{finding}/unignore', [FindingController::class, 'unignore']);
});
